// Offline packing for RIFE v4 interpolation. The browser loads only the generated WebP frames.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/imgcodecs.hpp>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>
using namespace cv;namespace fs=std::filesystem;
constexpr int tile=288,columns=8,frames=31;
Mat background(const Mat& rgba,int value){Mat out(rgba.size(),CV_8UC3);for(int y=0;y<rgba.rows;y++)for(int x=0;x<rgba.cols;x++){auto p=rgba.at<Vec4b>(y,x);float a=p[3]/255.f;auto&q=out.at<Vec3b>(y,x);for(int c=0;c<3;c++)q[c]=saturate_cast<uchar>(p[c]*a+value*(1-a));}return out;}
int main(int argc,char**argv){
 setNumThreads(1);if(argc<2)return 1;std::string mode=argv[1];
 if(mode=="matte"){
  if(argc<5)return 1;int cols=argc>5?std::stoi(argv[5]):6,rows=argc>6?std::stoi(argv[6]):4;Mat source=imread(argv[2],IMREAD_UNCHANGED),reference=imread(argv[3],IMREAD_UNCHANGED);if(source.size()!=reference.size())return 2;
  Mat result=source.clone();
  for(int row=0;row<rows;row++)for(int col=0;col<cols;col++){
   int cw=source.cols/cols,ch=source.rows/rows;Rect region(col*cw,row*ch,cw,ch);Mat src=source(region),ref=reference(region),alpha;extractChannel(ref,alpha,3);threshold(alpha,alpha,cols==6?240:128,255,THRESH_BINARY);
   Mat inner,outer;erode(alpha,inner,getStructuringElement(MORPH_ELLIPSE,Size(9,9)));dilate(alpha,outer,getStructuringElement(MORPH_ELLIPSE,Size(25,25)));
   Mat labels(alpha.size(),CV_8U,Scalar(GC_PR_BGD));labels.setTo(GC_PR_FGD,alpha);labels.setTo(GC_FGD,inner);labels.setTo(GC_BGD,outer==0);
   Mat rgb;cvtColor(src,rgb,COLOR_BGRA2BGR);for(int y=0;y<rgb.rows;y++)for(int x=0;x<rgb.cols;x++)if(src.at<Vec4b>(y,x)[3]<25)rgb.at<Vec3b>(y,x)=Vec3b(30,20,12);Mat bg,fg;grabCut(rgb,labels,Rect(),bg,fg,4,GC_INIT_WITH_MASK);
   Mat foreground=(labels==GC_FGD)|(labels==GC_PR_FGD);GaussianBlur(foreground,foreground,Size(3,3),.5);
   insertChannel(foreground,result(region),3);
  }
  return imwrite(argv[4],result)?0:3;
 }
 if(mode=="keys"){
  if(argc<5)return 1;int cols=argc>5?std::stoi(argv[5]):6,rows=argc>6?std::stoi(argv[6]):4;Mat source=imread(argv[2],IMREAD_UNCHANGED);if(source.cols!=1536||source.rows!=1024||source.channels()!=4)return 2;
  std::ifstream in(argv[3]);std::string work=argv[4];fs::create_directories(work+"/keys");
  std::ofstream plants(work+"/plants.tsv");
  for(int row=0;row<4;row++){
   std::vector<Point2f> anchors(6);Point2f pivot;for(auto&p:anchors)in>>p.x>>p.y;in>>pivot.x>>pivot.y;
   Point2f fixed(144,270),landing=fixed+anchors[3]-pivot;plants<<landing.x<<' '<<landing.y<<'\n';
   for(std::string bg:{"black","white"}){fs::create_directories(work+"/row"+std::to_string(row)+"-"+bg+"/in");fs::create_directories(work+"/row"+std::to_string(row)+"-"+bg+"/out");}
   for(int frame=0;frame<6;frame++){
    Point2f anchor=frame<3?anchors[frame]:frame==3?pivot:anchors[frame],target=frame<4?fixed:landing;
    Mat transform=(Mat_<double>(2,3)<<1,0,target.x-anchor.x,0,1,target.y-anchor.y),pose;
    warpAffine(source(Rect(frame*256,row*256,256,256)),pose,transform,Size(tile,tile),INTER_LINEAR,BORDER_CONSTANT);
    imwrite(work+"/keys/"+std::to_string(row)+"-"+std::to_string(frame)+".png",pose);
    for(std::string bg:{"black","white"})imwrite(work+"/row"+std::to_string(row)+"-"+bg+"/in/"+std::to_string(frame)+".png",background(pose,bg=="black"?0:255));
   }
  }
  return 0;
 }
 if(mode=="pack"){
  if(argc<4)return 1;int rows=argc>4?std::stoi(argv[4]):4;std::string work=argv[2];Mat sheet=Mat::zeros(tile*16,tile*columns,CV_8UC4);int index=0;
  for(int row=0;row<rows;row++)for(int frame=0;frame<frames;frame++){
   Mat rgba;
   if(frame%6==0)rgba=imread(work+"/keys/"+std::to_string(row)+"-"+std::to_string(frame/6)+".png",IMREAD_UNCHANGED);
   else{
    char file[32];snprintf(file,sizeof(file),"%08d.png",frame+1);
    Mat black=imread(work+"/row"+std::to_string(row)+"-black/out/"+file),white=imread(work+"/row"+std::to_string(row)+"-white/out/"+file);if(black.empty()||white.empty())return 3;
    rgba=Mat::zeros(tile,tile,CV_8UC4);
    for(int y=0;y<tile;y++)for(int x=0;x<tile;x++){
     auto b=black.at<Vec3b>(y,x),w=white.at<Vec3b>(y,x);float delta[3]={float(w[0])-b[0],float(w[1])-b[1],float(w[2])-b[2]};std::sort(delta,delta+3);
     float alpha=std::clamp(1-delta[1]/255.f,0.f,1.f);if(alpha<.30f)continue;float coverage=std::clamp((alpha-.30f)/.70f,0.f,1.f);if(alpha>.98f)coverage=1;
     auto&p=rgba.at<Vec4b>(y,x);for(int c=0;c<3;c++)p[c]=saturate_cast<uchar>(b[c]/alpha);p[3]=saturate_cast<uchar>(coverage*255);
    }
   }
   rgba.copyTo(sheet(Rect((index%columns)*tile,(index/columns)*tile,tile,tile)));index++;
  }
  if(!imwrite(argv[3],sheet,{IMWRITE_WEBP_QUALITY,95}))return 4;std::cout<<"124 frames packed\n";return 0;
 }
 return 1;
}
