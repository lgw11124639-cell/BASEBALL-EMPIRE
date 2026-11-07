// Build displacement DATA from the approved native-alpha cuts; never edits source artwork.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/video/tracking.hpp>
#include <iostream>
#include <cmath>
using namespace cv;
static Mat guide(const Mat& rgba){Mat rgb; cvtColor(rgba,rgb,COLOR_BGRA2BGR);for(int y=0;y<rgb.rows;y++)for(int x=0;x<rgb.cols;x++){float a=rgba.at<Vec4b>(y,x)[3]/255.f;auto&p=rgb.at<Vec3b>(y,x);for(int k=0;k<3;k++)p[k]=saturate_cast<uchar>(p[k]*a+72*(1-a));}Mat gray;cvtColor(rgb,gray,COLOR_BGR2GRAY);return gray;}
int main(int argc,char**argv){if(argc<3)return 1;setNumThreads(2);const int tile=384,grid=96,count=59,cols=10,rows=12;Mat image=imread(argv[1],IMREAD_UNCHANGED);if(image.cols!=3840||image.rows!=2304||image.channels()!=4)return 2;Mat output(rows*grid,cols*grid,CV_8UC3,Scalar(0,128,128));auto dis=DISOpticalFlow::create(DISOpticalFlow::PRESET_MEDIUM);dis->setUseSpatialPropagation(true);dis->setVariationalRefinementIterations(8);double mean=0;
 for(int i=0;i<count;i++){Mat a=image(Rect(i%10*tile,i/10*tile,tile,tile)),b=image(Rect((i+1)%10*tile,(i+1)/10*tile,tile,tile));Mat ga=guide(a),gb=guide(b),forward,backward;dis->calc(ga,gb,forward);dis->calc(gb,ga,backward);
  for(int direction=0;direction<2;direction++){Mat flow=direction?backward:forward;const Mat& src=direction?b:a; // Lock the actual planted sole, not the whole lower body.
   int source=i+direction;Point2f anchor=source<32?Point2f(100,350):Point2f(252,340);
   for(int y=0;y<tile;y++)for(int x=0;x<tile;x++){auto&v=flow.at<Vec2f>(y,x);float d=norm(Point2f(x,y)-anchor);if((i<31||i>=32)&&d<12)v*=std::max(0.f,(d-5)/7); // both endpoints share this planted foot
    if(!std::isfinite(v[0])||!std::isfinite(v[1]))v=Vec2f(0,0);for(int k=0;k<2;k++)v[k]=std::max(-96.f,std::min(96.f,v[k]));}
   Mat small;resize(flow,small,Size(grid,grid),0,0,INTER_AREA);int n=i*2+direction,ox=n%cols*grid,oy=n/cols*grid;
   for(int y=0;y<grid;y++)for(int x=0;x<grid;x++){Vec2f v=small.at<Vec2f>(y,x);int dx=std::max(0,std::min(4095,int(std::round(v[0]*8+2048)))),dy=std::max(0,std::min(4095,int(std::round(v[1]*8+2048)))); // RGB stores two signed12-bit values; alpha is never used for data.
    Vec3b packed;packed[2]=dx>>4;packed[1]=((dx&15)<<4)|(dy>>8);packed[0]=dy&255;output.at<Vec3b>(oy+y,ox+x)=packed;mean+=norm(v);}
  }std::cout<<"Motion pair "<<i+1<<"/59\n";
 }if(!imwrite(argv[2],output))return 3;std::cout<<"PASS118 bidirectional96x96 motion fields; mean displacement "<<mean/(118*grid*grid)<<" pixels\n";
}
