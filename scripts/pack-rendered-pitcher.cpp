// Whole authored pose packing only. No color transfer, limb compositing or temporal interpolation.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/imgcodecs.hpp>
#include <algorithm>
#include <iostream>
using namespace cv;
Point sole(const Mat& pose,Point expected){Point best=expected;float score=1e9;for(int y=195;y<256;y++)for(int x=30;x<235;x++){auto p=pose.at<Vec4b>(y,x);if(p[3]<160||std::max({p[0],p[1],p[2]})>140)continue;float d=std::hypot((x-expected.x)*.7f,(y-expected.y)*2.f);if(d<score){score=d;best={x,y};}}return best;}
int main(int argc,char**argv){if(argc!=4)return 1;setNumThreads(1);Mat source=imread(argv[1],IMREAD_UNCHANGED),ready=imread(argv[2],IMREAD_UNCHANGED);if(source.size()!=Size(1536,1024)||ready.size()!=Size(256,256)||source.channels()!=4||ready.channels()!=4)return 2;
 const Point expect[6]={{125,250},{125,250},{78,250},{184,249},{142,250},{144,250}},near[4]={{184,23},{195,50},{216,76},{217,131}};Mat atlas=Mat::zeros(288*4,288*7,CV_8UC4);Point release[4];
 for(int row=0;row<4;row++)for(int frame=0;frame<7;frame++){
  Mat pose=frame?source(Rect((frame-1)*256,row*256,256,256)):ready;Point foot=sole(pose,frame?expect[frame-1]:Point(153,250)),target=frame>=4?Point(204,254):Point(144,270),delta=target-foot;Mat transform=(Mat_<double>(2,3)<<1,0,delta.x,0,1,delta.y),out;warpAffine(pose,out,transform,Size(288,288),INTER_NEAREST,BORDER_CONSTANT);out.copyTo(atlas(Rect(frame*288,row*288,288,288)));
  if(frame==4){Point point=near[row];float best=1e9;for(int y=std::max(0,point.y-76);y<std::min(256,point.y+77);y++)for(int x=std::max(0,point.x-76);x<std::min(256,point.x+77);x++){auto p=pose.at<Vec4b>(y,x);if(p[3]<180||p[2]<80||p[2]<p[1]*1.08||p[2]>p[1]*1.95||p[1]<p[0]*1.03)continue;float d=std::hypot(float(x-near[row].x),float(y-near[row].y));if(d<best){best=d;point={x,y};}}release[row]=point+delta;}
 }
 if(!imwrite(argv[3],atlas,{IMWRITE_WEBP_QUALITY,95}))return 3;
 std::cout<<"{\"release\":[";for(int row=0;row<4;row++){if(row)std::cout<<',';std::cout<<'['<<release[row].x<<','<<release[row].y<<']';}std::cout<<"]}";return 0;
}
