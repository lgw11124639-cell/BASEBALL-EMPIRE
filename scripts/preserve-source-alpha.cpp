// Packaging guard: foreground extraction must never resurrect the source's transparent background.
#include <opencv2/core.hpp>
#include <opencv2/imgcodecs.hpp>
#include <algorithm>
int main(int argc,char**argv){if(argc!=4)return 1;auto source=cv::imread(argv[1],cv::IMREAD_UNCHANGED),matte=cv::imread(argv[2],cv::IMREAD_UNCHANGED);if(source.size()!=matte.size()||source.channels()!=4||matte.channels()!=4)return 2;for(int y=0;y<source.rows;y++)for(int x=0;x<source.cols;x++){const auto a=source.at<cv::Vec4b>(y,x)[3];auto&p=matte.at<cv::Vec4b>(y,x);p[3]=cv::saturate_cast<uchar>(p[3]*std::clamp((float(a)-96.f)/144.f,0.f,1.f));}return cv::imwrite(argv[3],matte)?0:3;}
