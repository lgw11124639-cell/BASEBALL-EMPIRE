// Offline foreground extraction only; never synthesizes body pixels. Model/executable are not shipped.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/dnn.hpp>
#include <iostream>
using namespace cv;
int main(int argc,char**argv){
 if(argc<4)return 1;int cols=argc>4?std::stoi(argv[4]):6,rows=argc>5?std::stoi(argv[5]):4;setNumThreads(2);auto net=dnn::readNetFromONNX(argv[1]);Mat source=imread(argv[2],IMREAD_UNCHANGED);if(source.channels()==3)cvtColor(source,source,COLOR_BGR2BGRA);Mat result=source.clone();
 for(int row=0;row<rows;row++)for(int col=0;col<cols;col++){
  int x0=std::round(double(col)*source.cols/cols),y0=std::round(double(row)*source.rows/rows),x1=std::round(double(col+1)*source.cols/cols),y1=std::round(double(row+1)*source.rows/rows);Rect rect(x0,y0,x1-x0,y1-y0);Mat src=source(rect),rgb;cv::cvtColor(src,rgb,COLOR_BGRA2BGR);
  for(int y=0;y<rgb.rows;y++)for(int x=0;x<rgb.cols;x++){float a=src.at<Vec4b>(y,x)[3]/255.f;auto &p=rgb.at<Vec3b>(y,x);for(int c=0;c<3;c++)p[c]=saturate_cast<uchar>(p[c]*a+255*(1-a));}
  resize(rgb,rgb,Size(320,320));cvtColor(rgb,rgb,COLOR_BGR2RGB);rgb.convertTo(rgb,CV_32FC3,1./255);
  for(int y=0;y<320;y++)for(int x=0;x<320;x++){auto&p=rgb.at<Vec3f>(y,x);p[0]=(p[0]-.485f)/.229f;p[1]=(p[1]-.456f)/.224f;p[2]=(p[2]-.406f)/.225f;}
  net.setInput(dnn::blobFromImage(rgb));auto output=net.forward(net.getUnconnectedOutLayersNames()[0]);Mat mask(320,320,CV_32F,output.ptr<float>());double lo,hi;minMaxLoc(mask,&lo,&hi);mask=(mask-lo)/(hi-lo+1e-6);resize(mask,mask,src.size());erode(mask,mask,getStructuringElement(MORPH_ELLIPSE,Size(3,3)));
  // Remove detached caption components; keep the complete connected foreground figure.
  Mat binary,labels,stats,centroids;threshold(mask,binary,.35,255,THRESH_BINARY);binary.convertTo(binary,CV_8U);
  int count=connectedComponentsWithStats(binary,labels,stats,centroids),largest=1;
  for(int i=2;i<count;i++)if(stats.at<int>(i,CC_STAT_AREA)>stats.at<int>(largest,CC_STAT_AREA))largest=i;
  for(int y=0;y<mask.rows;y++)for(int x=0;x<mask.cols;x++)if(labels.at<int>(y,x)!=largest)mask.at<float>(y,x)=0;
  for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){float a=std::clamp((mask.at<float>(y,x)-.35f)/.45f,0.f,1.f)*std::clamp((float(src.at<Vec4b>(y,x)[3])-96.f)/144.f,0.f,1.f);result.at<Vec4b>(rect.y+y,rect.x+x)[3]=saturate_cast<uchar>(a*255);}
 }
 imwrite(argv[3],result);std::cout<<"background removed\n";
}
