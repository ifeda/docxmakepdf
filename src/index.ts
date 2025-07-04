import path = require("path");
import fs = require("fs");
import { renderAsync } from "docx-preview-node";
import { JSDOM } from "jsdom";
import pdfMake from "pdfmake/build/pdfmake";
import pdfmake_vfs_fonts from "pdfmake/build/vfs_fonts";
import fonts from "./fonts_def";
import HtmlToPdfmake from "./htmlToPdfMake";

import type {
  Input,
  InputOptions,
  Content,
  TDocumentDefinitions,
  BufferOptions,
} from "./common";

type Result = {
  toFile: (filename: string) => Promise<string>;
  toBuffer: () => Promise<Buffer>;
  toStream: () => Promise<NodeJS.ReadableStream>;
};

async function docx2pdf(
  { docxFile, docxBuffer }: Input,
  options?: InputOptions
): Promise<Result> {
  if (docxFile && fs.existsSync(docxFile)) {
    // 从路径读取文件
    docxBuffer = fs.readFileSync(docxFile);
  } else return Promise.reject(`Not found docx file:${docxFile}`);
  if (docxBuffer) {
    // 从buffer转换
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      pretendToBeVisual: true,
    });
    const container = dom.window.document.body;
    await renderAsync(docxBuffer, container, undefined, {
      inWrapper: false,
      ignoreWidth: true,
      ignoreHeight: true,
      ignoreLastRenderedPageBreak: true,
      renderHeaders: false,
      renderFooters: false,
      useBase64URL: true,
      ignoreFonts: true,
      renderFootnotes: false, //enables footnotes rendering
      renderEndnotes: false, //enables endnotes rendering
      renderComments: false, //enables experimental comments rendering
      renderAltChunks: false,
      hideWrapperOnPrint: true,
      breakPages: true,
    });
    const html = container.innerHTML.replace(/<\/?span[^>]*>/g, "");
    //fs.writeFileSync("test/" + path.basename(docxFile) + ".html", html);
    const htmlToPdfmake = new HtmlToPdfmake({
      pageSize: options?.pageSize,
      pageOrientation: options?.pageOrientation || "portrait",
      pageMargin: options?.pageMargin,
    });
    const content = htmlToPdfmake.convert(html);
    //console.log(require("util").inspect(content, { showHidden: false, depth: null }));
    const docDefinition: TDocumentDefinitions = {
      version: options?.version || "1.7",
      language: options?.language || "zh-CN",
      pageSize: options?.pageSize || "A4",
      pageOrientation: options?.pageOrientation || "portrait",
      defaultStyle: {
        font: options?.defaultFont || "SourceHanSerifCN",
      },
      pageMargins: options?.pageMargin
        ? [
            HtmlToPdfmake.convertToUnit(options.pageMargin.left) || 36,
            HtmlToPdfmake.convertToUnit(options.pageMargin.top) || 36,
            HtmlToPdfmake.convertToUnit(options.pageMargin.right) || 36,
            HtmlToPdfmake.convertToUnit(options.pageMargin.bottom) || 36,
          ]
        : [36, 36, 36, 36],
      watermark: options?.watermark,
      content: <Content>content,
    };
    const vfs = options?.vfs || require("./vfs_fonts.js");
    pdfMake.vfs = {
      ...pdfmake_vfs_fonts,
      ...vfs,
    };
    pdfMake.fonts = options?.fonts || fonts;
    const result = pdfMake.createPdf(docDefinition);
    const bufferOptions: BufferOptions = {
      tableLayouts: {
        "html-table": {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
        },
      },
    };
    return {
      toBuffer: (): Promise<Buffer> =>
        new Promise((resolve, reject) => {
          try {
            result.getBuffer((buffer) => {
              resolve(buffer);
            }, bufferOptions);
          } catch (err) {
            reject(err);
          }
        }),
      toFile: (filename: string): Promise<string> =>
        new Promise((resolve, reject) => {
          try {
            result.getBuffer((buffer) => {
              fs.writeFileSync(path.resolve(filename), buffer);
              resolve(path.resolve(filename));
            }, bufferOptions);
          } catch (err) {
            reject(err);
          }
        }),
      toStream: (): Promise<NodeJS.ReadableStream> =>
        new Promise((resolve, reject) => {
          try {
            resolve(result.getStream(bufferOptions));
          } catch (err) {
            reject(err);
          }
        }),
    };
  } else
    return Promise.reject(
      "Either docx file path<docxFile> or buffer object<docxBuffer> must be provided."
    );
}
export default docx2pdf;
