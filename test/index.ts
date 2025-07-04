import path from "path";
import docx2pdf from "../src";
docx2pdf(
  {
    docxFile: path.resolve(__dirname, "./test.docx"),
  },
  {
    pageMargin: {
      left: "1.27cm",
      top: "1.27cm",
      right: "1.27cm",
      bottom: "1.27cm",
    },
    watermark: { text: "测试PDF水印", angle: -50, opacity: 0.1 },
  }
).then((pdfDoc) => {
  return pdfDoc.toFile(path.resolve(__dirname, "./test.pdf"));
});
