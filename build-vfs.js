/**
 * 因为字体面临版权问题，所以pdfmake没有内置字体，也没有读取计算机/服务器上已经安装的字体，所以需要您自己制作已经获取版权的字体数据并加载
 * docx2pdf内置了开源免费商用的思源宋体，如果您要添加字体，必须先加工vfs，然后定义字体名称和文件名对应关系
 *
 * 1、加工vfs：
 * 生成pdfmake所能识别的字体源数据，原理是将ttf字体通过base64编码加工成vfs；最好用ttf字体，otf字体和ttc字体我试验没成功；java压缩过的字体也有些问题，会出现无法识别的字符（似乎是空格）；
 * `node build-vfs.js <path> [filename]`
 * 参数：
 * 		path: 字体所在目录，必须放在一个目录中，不支持子目录
 * 		filename: 存储vfs数据的文件，默认是build/vfs_fonts.js
 *
 * 2、定义字体名称和文件名对应关系
 * 要使用vfs还必须按照如下格式定义字体
 * "simsun": {
    "normal": "SourceHanSerifCN-Regular.ttf",
    "bold": "SourceHanSerifCN-Regular.ttf",
    "italics": "SourceHanSerifCN-Regular.ttf",
    "bolditalics": "SourceHanSerifCN-Regular.ttf"
   }
 * SourceHanSerifCN 就是字体名称，比如："宋体" "simsun"
	 还必须定义 normal、bold、italics、bolditalics 四种样式，如果字体没有这些样式，可以引用其他样式字体文件名
	 SourceHanSerifCN-Regular.ttf 这就是字体文件名（不需要带路径），必须和第一步加工vfs时一致（大小写敏感）
 */
require("pdfmake/build-vfs.js")