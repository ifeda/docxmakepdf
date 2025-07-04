# docx-make-pdf

在后端（nodeJs环境）将docx文档转换为pdf。搭配docx-template可以实现生成订单。

**步骤原理：**

1. 通过[docx-preview](https://github.com/VolodymyrBaydalka/docxjs)的node修改版[docx-preview-node](https://github.com/ifeda/docx-preview-node)先转换为html

2. 再通过[html-to-pdfmake](https://github.com/Aymkdn/html-to-pdfmake)（基于源码修改）转换为pdfmake的docDefinition

3. 然后通过[pdfmake](https://www.npmjs.com/package/pdfmake)输出为pdf文件

**优点：**

1. 不需要操作系统安装依赖，纯js代码

2. 支持输出buffer方便后续通过Node-SignPDF等模块加数字签名

3. 支持多页输出，支持识别word分页符

4. 异步模式Promise

5. Typescript友好

**缺点：**

1. 不支持word文件既包含纵向页面也包含横向页面

2. 不支持word文本框、图表

3. 宽度（如表格）适应不是很精确，无法精确地水平居中（所以尽量不要使用带边框的表格）

4. 不能使用系统自带字体，必须自己加工vfs字体文件

5. 集成了思源宋体，所以包比较大

## 安装

`npm install -S docx-make-pdf`

## 使用

```typescript
import docx2pdf from "docx-make-pdf"
docx2pdf({
    docxFile:string, //docx文件路径，绝对路径
    docxBuffer:Buffer, //docx文件内容
},{
    pageSize?: PageSize | undefined; //页面大小，默认A4
    pageOrientation?: "portrait" | "landscape"; // 页面方向，默认纵向 portrait
    pageMargin?: pageMargin | undefined; // 页边距，默认1.27厘米(36pt)
    version?: PDFVersion | undefined; // pdf版本，默认1.7
    watermark?: string | Watermark | undefined; // 页面水印
    language?: string | undefined; //页面语言，默认zh-cn
    vfs?: { [filename: string]: string }; // 自定义字体数据（如果设置要自己require加载哦），注意这里的filename是fonts中normal、bold、italics、bolditalics对应的filename
    fonts?: TFontDictionary; //自定义字体定义，参考build-vfs.js
    defaultFont?: string; // 默认字体名称，默认SourceHanSerifCN （思源宋体）
}):{
  toFile: (filename: string) => Promise<string>; //写入文件名
  toBuffer: () => Promise<Buffer>; // Buffer 生成的pdf文件内容数据
  toStream: () => Promise<NodeJS.ReadableStream>; // 可以自定义pipe输出
}
```

## 字体的制作

因为字体面临版权问题，所以pdfmake没有内置字体，也没有读取计算机/服务器上已经安装的字体，所以需要您自己制作已经获取版权的字体数据并加载。

docx-make-pdf内置了开源免费商用的思源宋体，如果您要添加字体，必须先加工vfs，然后定义字体名称和文件名对应关系。因为pdfmake说明较少，很多人容易糊涂，所以这里详细说明一下：

1. **加工vfs** 

生成pdfmake所能识别的字体源数据，原理是将ttf字体通过base64编码加工成vfs；建议最好用ttf字体，otf字体和ttc字体我试验没成功；java压缩过的字体也有些问题，会出现无法识别的字符（似乎是空格）；

`node build-vfs.js <path> [filename]`

参数说明：

- path: 字体所在目录，必须放在一个目录中，不支持子目录

- filename: 存储vfs数据的文件，默认是build/vfs_fonts.js

docx2pdf的package.json中内置了script可以参考下： `node build-vfs.js ./fonts ./src/vfs_fonts.js`

**加载使用：**

```javascript
const vfs_fonts = require("./vfs_fonts.js")
docx2pdf({docxBuffer},{vfs:vfs_fonts})
```

2. **定义字体名称和文件名对应关系**

要使用vfs还必须按照如下格式定义字体：

```typescript
fontFaceName:string {
   "normal": filename:string,
   "bold": filename:string,
   "italics": filename:string,
   "bolditalics": filename:string
}
```

注意：必须定义 normal、bold、italics、bolditalics 四种样式，否则pdfmake会报错；如果字体没有这些样式，可以引用其他样式字体文件名，例如：

```javascript
"SourceHanSerifCN": {
   "normal": "SourceHanSerifCN-Regular.ttf",
   "bold": "SourceHanSerifCN-Regular.ttf",
   "italics": "SourceHanSerifCN-Regular.ttf",
   "bolditalics": "SourceHanSerifCN-Regular.ttf"
}
```

SourceHanSerifCN 就是字体名称，比如："宋体" "simsun"

SourceHanSerifCN-Regular.ttf 这就是字体文件名（不需要带路径），必须和第一步加工vfs时一致（大小写敏感）

**加载使用：**

```typescript
docx2pdf({docxBuffer},{fonts:{
    fontFaceName:string {
       "normal": filename:string,
       "bold": filename:string,
       "italics": filename:string,
       "bolditalics": filename:string
    }
}})
```

提示：即时自定义了vfs和fonts也不会覆盖docx2pdf内置的“SourceHanSerifCN"和pdfmake内置的"Roboto"（没有Roboto会报错）
