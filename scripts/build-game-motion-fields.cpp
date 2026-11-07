// Whole-pose displacement data for every baked uniform and delivery. No source edits.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/video/tracking.hpp>
#include <iostream>
#include <cmath>
using namespace cv;
static Mat guide(const Mat&a){Mat rgb; cvtColor(a,rgb,COLOR_BGRA2BGR);for(int y=0;y<rgb.rows;y++)for(int x=0;x<rgb.cols;x++){float v=a.at<Vec4b>(y,x)[3]/255.f;auto&p=rgb.at<Vec3b>(y,x);for(int k=0;k<3;k++)p[k]=saturate_cast<uchar>(p[k]*v+72*(1-v));}Mat g;cvtColor(rgb,g,COLOR_BGR2GRAY);return g;}
int main(int argc,char**argv){if(argc<11)return 1;setNumThreads(1);int frames=atoi(argv[3]),forms=atoi(argv[4]),cols=atoi(argv[5]),plant=atoi(argv[6]);Point2f pivot(atof(argv[7]),atof(argv[8]));const int tile=384,grid=96,fields=forms*(frames-1)*2;Mat image=imread(argv[1],IMREAD_UNCHANGED),out(((fields+9)/10)*grid,10*grid,CV_8UC3,Scalar(0,8,128));auto dis=DISOpticalFlow::create(DISOpticalFlow::PRESET_MEDIUM);dis->setVariationalRefinementIterations(8);
 for(int row=0;row<forms;row++){Point2f landing(atof(argv[9+row*2]),atof(argv[10+row*2]));for(int i=0;i<frames-1;i++){int j=row*frames+i;Mat a=image(Rect(j%cols*tile,j/cols*tile,tile,tile)),b=image(Rect((j+1)%cols*tile,(j+1)/cols*tile,tile,tile)),ga=guide(a),gb=guide(b),f,bk;dis->calc(ga,gb,f);dis->calc(gb,ga,bk);for(int d=0;d<2;d++){Mat flow=d?bk:f;Point2f anchor=i+d<plant?pivot:landing;for(int y=0;y<tile;y++)for(int x=0;x<tile;x++){auto&v=flow.at<Vec2f>(y,x);float distance=norm(Point2f(x,y)-anchor);if((i<plant-1||i>=plant)&&distance<12)v*=std::max(0.f,(distance-5)/7);for(int k=0;k<2;k++)v[k]=std::isfinite(v[k])?std::max(-96.f,std::min(96.f,v[k])):0;}Mat small;resize(flow,small,Size(grid,grid),0,0,INTER_AREA);int n=(row*(frames-1)+i)*2+d,ox=n%10*grid,oy=n/10*grid;for(int y=0;y<grid;y++)for(int x=0;x<grid;x++){auto v=small.at<Vec2f>(y,x);int dx=std::max(0,std::min(4095,int(std::round(v[0]*8+2048)))),dy=std::max(0,std::min(4095,int(std::round(v[1]*8+2048))));out.at<Vec3b>(oy+y,ox+x)=Vec3b(dy&255,((dx&15)<<4)|(dy>>8),dx>>4);}}}}
 if(!imwrite(argv[2],out))return 2;std::cout<<"Packed "<<fields<<" fields\n";
}
