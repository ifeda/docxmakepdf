// source: https://github.com/ChaosEvoker/html-to-pdf

import { JSDOM } from "jsdom";
import type { PageSize, PageOrientation, pageMargin } from "./common";
import { pageSizeDefine } from "./common";
import { inspect } from "util";
/**
 * Transform HTML code to a PdfMake object
  To use it:
  import HtmlToPdfMake from 'htmlToPdfMake.ts'
  new htmlToPdfMake.convert('<b>my bold text</b>');
*/

interface Options {
  pageSize?: PageSize;
  pageOrientation?: PageOrientation;
  pageMargin?: pageMargin | undefined;
  tableAutoSize?: boolean;
  imagesByReference?: boolean;
  removeExtraBlanks?: boolean;
  showHidden?: boolean;
  removeTagClasses?: boolean;
  ignoreStyles?: string[];
  defaultStyles?: { [tag: string]: any };
  customTag?: Function | undefined;
  replaceText?: Function | undefined;
  fontSizes?: number[];
}

export default class HtmlToPdfMake {
  pageSize: PageSize;
  pageMargin: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  maxWidth: number;
  tableAutoSize: boolean;
  imagesByReference: boolean;
  removeExtraBlanks: boolean;
  showHidden: boolean;
  removeTagClasses: boolean;
  ignoreStyles: string[];
  defaultStyles: { [tag: string]: any };
  customTag: Function | undefined;
  replaceText: Function | undefined;
  fontSizes: number[];
  protected imagesRef: any[];
  protected imagesByReferenceSuffix: string;

  /**
   * Convert 'px'/'rem'/'cm'/'em'/'in' to 'pt', and return false for the other ones. If it's only a number, it will just return it
   *
   * @param  {String} val The value with units (e.g. 12px)
   * @return {Number|Boolean} Return the pt value, or false
   */
  public static convertToUnit(val: any): number | false {
    // if it's just a number, then return it
    if (!isNaN(val) && isFinite(parseFloat(val))) return parseFloat(val);
    var mtch = (val + "").trim().match(/^(-?\d*(\.\d+)?)(pt|px|r?em|cm|in)$/);
    // if we don't have a number with supported units, then return false
    if (!mtch) return false;
    val = mtch[1];
    switch (mtch[3]) {
      case "px": {
        return Math.round(parseFloat(val) * 0.75292857248934 * 100) * 0.01; // 1px => 0.75292857248934pt
      }
      case "em":
      case "rem": {
        return parseFloat(val) * 12; // default font-size is 12pt
      }
      case "cm": {
        return Math.round(parseFloat(val) * 28.34646 * 100) * 0.01; // 1cm => 28.34646
      }
      case "in": {
        return parseFloat(val) * 72; // 1in => 72 pt
      }
      default: {
        return parseFloat(val);
      }
    }
  }

  public static toCamelCase(str: string): string {
    return str.replace(/-([a-z])/g, function (g) {
      return g[1].toUpperCase();
    });
  }

  // Convert the CSS properties like:
  //  - top right bottom left
  //  - top (left/right) bottom
  //  - (top/bottom) (left/right)
  //  - (top/bottom/left/right)
  //
  // to an object that gives {top, right, bottom, left}
  public static topRightBottomLeftToObject(props: string): any {
    // regexp to capture the colors (hex, rgb, rgba, hsl, hsla, color name)
    var colorRegex =
      /#[0-9a-fA-F]{3,6}|\b(?:rgba?|hsla?)\([^)]*\)|\b[a-zA-Z]+\b/g;
    var colors = props.match(colorRegex) || [];

    var top: any = colors[0],
      right: any = colors[1],
      bottom: any = colors[2],
      left: any = colors[3];

    switch (colors.length) {
      case 1:
        right = bottom = left = top;
        break;
      case 2:
        bottom = top;
        left = right;
        break;
      case 3:
        left = right;
        break;
    }

    return { top, right, bottom, left };
  }

  // input: h in [0,360] and s,v in [0,1] - output: "rgb(0–255,0–255,0–255)""
  // source: https://stackoverflow.com/a/54014428/1134119 + https://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion#comment58413965_9493060
  public static hsl2rgb = function (h: number, s: number, l: number): string {
    var a = s * Math.min(l, 1 - l);
    var f = function (n: number) {
      var k = (n + h / 30) % 12;
      return Math.min(
        Math.floor((l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)) * 256),
        255
      );
    };
    return "rgb(" + f(0) + "," + f(8) + "," + f(4) + ")";
  };

  /**
   * Returns the color in a hex format (e.g. #12ff00).
   * Also tries to convert RGB colors into hex values
   *
   * @param color color as string representation
   * @returns {color (as hex values for pdfmake), opacity}
   */
  public static parseColor(color: string) {
    var opacity = 1;
    // e.g. `#fff` or `#ff0048`
    var haxRegex = new RegExp("^#([0-9a-f]{3}|[0-9a-f]{6})$", "i");

    // e.g. rgb(0,255,34) or rgb(22, 0, 0) or rgb(100%, 100%, 100%) or rgba(0,125,250,0.8)
    var rgbRegex =
      /^rgba?\(\s*(\d+(\.\d+)?%?),\s*(\d+(\.\d+)?%?),\s*(\d+(\.\d+)?%?)(,\s*\d+(\.\d+)?)?\)$/;

    // e.g. hsl(300, 10%, 20%)
    var hslRegex = new RegExp(
      "^hsl\\((\\d+(\\.\\d+)?%?),\\s*(\\d+(\\.\\d+)?%?),\\s*(\\d+(\\.\\d+)?%?)\\)$"
    );

    // e.g. "white" or "red"
    var nameRegex = new RegExp("^[a-z]+$", "i");

    var decimalColors: string[] | undefined,
      decimalValue,
      hexString,
      ret: any = [];
    if (haxRegex.test(color)) {
      return { color: color, opacity: opacity };
    }

    if (hslRegex.test(color)) {
      // we want to convert to RGB
      decimalColors = hslRegex.exec(color)?.slice(1);
      if (decimalColors) {
        // first value should be from 0 to 360
        if (decimalColors[0].endsWith("%"))
          decimalValue = (parseInt(decimalColors[0].slice(0, -1)) * 360) / 100;
        else decimalValue = parseInt(decimalColors[0]);
        ret.push(decimalValue);
        // next values should be % to convert to base 1
        ret.push(parseInt(decimalColors[2].slice(0, -1)) / 100);
        ret.push(parseInt(decimalColors[4].slice(0, -1)) / 100);
        color = this.hsl2rgb(ret[0], ret[1], ret[2]);
        ret = [];
      }
    }

    if (rgbRegex.test(color)) {
      decimalColors = rgbRegex.exec(color)?.slice(1);
      if (decimalColors) {
        decimalColors
          .filter(function (v, i) {
            return i % 2 === 0 && typeof v !== "undefined";
          })
          .forEach(function (value, i) {
            // for the alpha number
            if (i === 3) {
              opacity = parseInt(value.slice(1));
            } else {
              // if it ends with '%', we calculcate based on 100%=255
              if (value.endsWith("%")) {
                decimalValue = Math.round(
                  (parseInt(value.slice(0, -1)) * 255) / 100
                );
              } else decimalValue = parseInt(value);
              if (decimalValue > 255) {
                decimalValue = 255;
              }
              hexString = "0" + decimalValue.toString(16);
              hexString = hexString.slice(-2);
              ret.push(hexString);
            }
          });
      }
      return { color: "#" + ret.join(""), opacity: opacity };
    }
    if (nameRegex.test(color)) return { color: color, opacity: opacity };

    console.error('Could not parse color "' + color + '"');
    return { color: color, opacity: opacity };
  }

  protected static searchForStack(ret: any): boolean {
    if (Array.isArray(ret.text)) {
      for (var i = 0; i < ret.text.length; i++) {
        if (
          ret.text[i].stack ||
          [
            "SECTION",
            "ARTICLE",
            "DIV",
            "P",
            "SPAN",
            "TABLE",
            "SVG",
            "UL",
            "OL",
            "IMG",
            "H1",
            "H2",
            "H3",
            "H4",
            "H5",
            "H6",
          ].includes(ret.text[i].nodeName)
        )
          return true;
        if (this.searchForStack(ret.text[i]) === true) return true;
      }
    }
    return false;
  }

  constructor(options: Options) {
    if (typeof options.pageSize == "object") {
      this.pageSize = options.pageSize;
    } else {
      var di = pageSizeDefine[options?.pageSize || "A4"];
      this.pageSize = {
        width: options?.pageOrientation == "portrait" ? di[0] : di[1],
        height: options?.pageOrientation == "portrait" ? di[1] : di[0],
      };
    }
    this.pageMargin = options?.pageMargin
      ? {
          left: HtmlToPdfMake.convertToUnit(options.pageMargin.left) || 36,
          top: HtmlToPdfMake.convertToUnit(options.pageMargin.top) || 36,
          right: HtmlToPdfMake.convertToUnit(options.pageMargin.right) || 36,
          bottom: HtmlToPdfMake.convertToUnit(options.pageMargin.bottom) || 36,
        }
      : {
          left: 36,
          top: 36,
          right: 36,
          bottom: 36,
        };
    this.maxWidth = Math.round(
      this.pageSize.width - this.pageMargin.left - this.pageMargin.right - 2
    );
    this.tableAutoSize =
      options && typeof options.tableAutoSize === "boolean"
        ? options.tableAutoSize
        : true;
    this.imagesByReference =
      options && typeof options.imagesByReference === "boolean"
        ? options.imagesByReference
        : false;
    this.removeExtraBlanks =
      options && typeof options.removeExtraBlanks === "boolean"
        ? options.removeExtraBlanks
        : false;
    this.showHidden =
      options && typeof options.showHidden === "boolean"
        ? options.showHidden
        : false;
    this.removeTagClasses =
      options && typeof options.removeTagClasses === "boolean"
        ? options.removeTagClasses
        : false;
    this.ignoreStyles =
      options && Array.isArray(options.ignoreStyles)
        ? options.ignoreStyles
        : [];

    // A random string to be used in the image references
    this.imagesByReferenceSuffix = Math.random().toString(36).slice(2, 8);

    // Used with the size attribute on the font elements to calculate relative font size
    this.fontSizes =
      options && Array.isArray(options.fontSizes)
        ? options.fontSizes
        : [10, 14, 16, 18, 20, 24, 28];

    // set default styles
    this.defaultStyles = {
      b: { bold: true },
      strong: { bold: true },
      u: { decoration: "underline" },
      del: { decoration: "lineThrough" },
      s: { decoration: "lineThrough" },
      em: { italics: true },
      i: { italics: true },
      h1: { fontSize: 24, bold: true, marginBottom: 5 },
      h2: { fontSize: 22, bold: true, marginBottom: 5 },
      h3: { fontSize: 20, bold: true, marginBottom: 5 },
      h4: { fontSize: 18, bold: true, marginBottom: 5 },
      h5: { fontSize: 16, bold: true, marginBottom: 5 },
      h6: { fontSize: 14, bold: true, marginBottom: 5 },
      a: { color: "blue", decoration: "underline" },
      strike: { decoration: "lineThrough" },
      p: { margin: [0, 5, 0, 5] },
      ul: { marginBottom: 5, marginLeft: 5 },
      table: { marginBottom: 5 },
      th: { bold: true, fillColor: "#EEEEEE" },
    };

    if (options.customTag) {
      this.customTag = options.customTag;
    }
    if (options.replaceText) {
      this.replaceText = options.replaceText;
    }
    if (options && options.defaultStyles) {
      this.changeDefaultStyles(options.defaultStyles);
    }

    // store the references to the images
    this.imagesRef = [];
  }

  /**
   * Permit to change the default styles based on the options
   */
  private changeDefaultStyles(defaultStyles: any) {
    for (var keyStyle in defaultStyles) {
      if (this.defaultStyles.hasOwnProperty(keyStyle)) {
        // if we want to remove a default style
        if (
          defaultStyles.hasOwnProperty(keyStyle) &&
          !defaultStyles[keyStyle]
        ) {
          delete this.defaultStyles[keyStyle];
        } else {
          for (var k in defaultStyles[keyStyle]) {
            // if we want to delete a specific property
            if (defaultStyles[keyStyle][k] === "")
              delete this.defaultStyles[keyStyle][k];
            else this.defaultStyles[keyStyle][k] = defaultStyles[keyStyle][k];
          }
        }
      } else {
        // if we add default styles
        this.defaultStyles[keyStyle] = {};
        for (var ks in defaultStyles[keyStyle]) {
          this.defaultStyles[keyStyle][ks] = defaultStyles[keyStyle][ks];
        }
      }
    }
  }

  private getParentWidth(element: any): any {
    const parent = element.parentNode;
    if (!parent) return this.maxWidth;
    if (parent.style?.width || parent.width) {
      return Math.min(
        HtmlToPdfMake.convertToUnit(parent.style?.width || parent.width) ||
          this.maxWidth,
        this.maxWidth
      );
    } else return this.getParentWidth(parent);
  }

  convert(input: string | HTMLElement): any {
    if (typeof input == "string") {
      return this._parserHTML(input);
    } else return this._parserBody(input);
  }

  /**
   * Takes an HTML string, converts to HTML using a DOM parser and recursivly parses
   * the content into pdfmake compatible doc definition
   *
   * @param htmlText the html text to translate as string
   * @returns pdfmake doc definition as object
   */
  private _parserHTML(htmlText: string) {
    if (this.removeExtraBlanks)
      htmlText = htmlText
        .replace(
          /(<\/?(div|p|h1|h2|h3|h4|h5|h6|ol|ul|li)([^>]+)?>)\s+(<\/?(div|p|h1|h2|h3|h4|h5|h6|ol|ul|li))/gi,
          "$1$4"
        )
        .replace(
          /(<\/?(div|p|h1|h2|h3|h4|h5|h6|ol|ul|li)([^>]+)?>)\s+(<\/?(div|p|h1|h2|h3|h4|h5|h6|ol|ul|li))/gi,
          "$1$4"
        )
        .replace(/(<td([^>]+)?>)\s+(<table)/gi, "$1$3")
        .replace(/(<\/table>)\s+(<\/td>)/gi, "$1$2");
    // Create a HTML DOM tree out of html string
    const doc = new JSDOM("<html><body></body></html>").window.document;
    doc.body.innerHTML = htmlText;
    return this._parserBody(doc.body);
  }
  private _parserBody(body: HTMLElement) {
    var docDef = this.parseElement(body, []);
    // remove first level
    let result = docDef.stack || docDef.text;
    // if we only pass a string without HTML code
    if (typeof result === "string") result = { text: result };
    // if images by reference
    if (this.imagesByReference) {
      result = { content: result, images: {} };
      this.imagesRef.forEach((src, i) => {
        // check if 'src' is a JSON string
        result.images["img_ref_" + this.imagesByReferenceSuffix + i] =
          src.startsWith("{") ? JSON.parse(src) : src;
      });
    }
    return result;
  }

  /**
   * Converts a single HTML element to pdfmake, calls itself recursively for child html elements
   *
   * @param element can be an HTML element (<p>) or plain text ("Hello World")
   * @param parentNode the parent node for the current element
   * @param parents Array of node names of all the parents for the element
   * @returns the doc def to the given element in consideration to the given paragraph and styles
   */
  private parseElement(element: any, parents: any): any {
    var nodeName: string = element.nodeName.toUpperCase();
    var nodeNameLowerCase: string = nodeName.toLowerCase();
    var ret: any = { text: [] };
    var text,
      needStack = false;
    var dataset,
      i,
      key,
      _this = this;

    // ignore some HTML tags
    if (["STYLE", "SCRIPT", "META", "COLGROUP", "COL"].indexOf(nodeName) > -1)
      return "";

    switch (element.nodeType) {
      case 3: {
        // TEXT_NODE
        if (element.textContent) {
          text = element.textContent;
          // check if we have 'white-space' in the parent's style
          // or if a parent is a <PRE>
          var styleParentTextNode = this.parseStyle(
            parents[parents.length - 1],
            true
          );
          var hasWhiteSpace =
            parents.findIndex(function (p: any) {
              return p.nodeName === "PRE";
            }) > -1;
          for (i = 0; i < styleParentTextNode.length; i++) {
            if (styleParentTextNode[i].key === "preserveLeadingSpaces") {
              hasWhiteSpace = styleParentTextNode[i].value;
              break;
            }
          }
          // if no 'white-space' style, then deal with white spaces
          if (!hasWhiteSpace) text = text.replace(/\s*\n\s*/g, " ");
          if (typeof this.replaceText === "function")
            text = this.replaceText(text, parents);

          // for table, thead, tbody, tfoot, tr, ul, ol: remove all empty space
          if (
            ["TABLE", "THEAD", "TBODY", "TFOOT", "TR", "UL", "OL"].indexOf(
              parents[parents.length - 1].nodeName
            ) > -1
          )
            text = text.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
          if (text) {
            ret = { text: text };
            ret = this.applyStyle({ ret: ret, parents: parents });
            return ret;
          }
        }

        return "";
      }
      case 1: {
        // ELEMENT_NODE
        if (
          (!this.showHidden &&
            element.style.display &&
            element.style.display === "none") ||
          (element.style.visibility && element.style.visibility === "hidden")
        ) {
          return;
        }
        if (
          element.getAttribute("page") !== null &&
          element.getAttribute("page") !== "1"
        ) {
          ret.pageBreak = "before";
        }
        ret.nodeName = nodeName;
        if (element.id) ret.id = element.id;
        parents.push(element);

        if (element.childNodes && element.childNodes.length > 0) {
          [].forEach.call(element.childNodes, (child) => {
            var res = _this.parseElement(child, parents);
            if (res) {
              if (Array.isArray(res.text) && res.text.length === 0)
                res.text = " ";
              ret.text.push(res);
            }
          });
          //console.log(nodeName,'=>',util.inspect(ret.text, {showHidden: false, depth: null})); // to debug
          // find if we need a 'stack' instead of a 'text'
          needStack = HtmlToPdfMake.searchForStack(ret);
          if (needStack) {
            ret.stack = ret.text.slice(0);
            delete ret.text;
            ret = this.applyStyle({ ret: ret, parents: [element] });
          } else {
            // apply all the inhirent classes and styles from the parents
            ret = this.applyStyle({ ret: ret, parents: parents });
          }
        }
        parents.pop();

        switch (nodeName) {
          case "DIV": {
            if (element.parentNode.nodeName == "p") {
              ret = this.applyStyle({ ret: ret, parents: parents });
            }
            break;
          }
          case "TABLE": {
            var rowIndex: number;
            // the format for the table is table.body[[], [], …]
            ret.table = { body: [] };

            var tbodies = ret.stack || ret.text;
            if (Array.isArray(tbodies)) {
              rowIndex = 0;
              // Array with All Rows including THEAD
              var hasRowSpan = false; // TRUE if we have some rowspan
              // first round is to deal with colspan
              // for each THEAD / TBODY
              tbodies.forEach(function (tbody) {
                // for each row
                var rows = tbody.stack || tbody.text;
                if (Array.isArray(rows)) {
                  rows.forEach(function (row) {
                    var cells = row.stack || row.text;
                    // for each cell
                    if (Array.isArray(cells)) {
                      ret.table.body[rowIndex] = [];
                      cells.forEach(function (cell) {
                        ret.table.body[rowIndex].push(cell);
                        // do we have a colSpan?
                        // if yes, insert empty cells due to colspan
                        if (cell.colSpan > 1) {
                          i = cell.colSpan;
                          // insert an empty cell for each colspan
                          while (--i > 0) {
                            ret.table.body[rowIndex].push({ text: " " });
                          }
                        }

                        // do we have a rowSpan ?
                        if (cell.rowSpan > 1) hasRowSpan = true;
                      });
                      rowIndex++;
                    }
                  });
                }
              });

              if (hasRowSpan) {
                var header = ret.table.body[0];
                if (Array.isArray(header)) {
                  // determine the number of columns
                  var columnsCount = header.length;
                  // determine the number of rows
                  var rowsCount = ret.table.body.length;

                  // for each column
                  for (
                    var columnInd = 0;
                    columnInd < columnsCount;
                    columnInd++
                  ) {
                    for (var rowInd = 0; rowInd < rowsCount; rowInd++) {
                      var row = ret.table.body[rowInd];
                      if (Array.isArray(row)) {
                        var cell = row[columnInd];
                        // do we have a rowSpan?
                        if (cell.rowSpan > 1) {
                          var len = cell.rowSpan;
                          var cs,
                            colspan = cell.colSpan ? cell.colSpan : 1;
                          for (var j = 1; j <= len - 1; j++) {
                            cs = colspan;
                            if (ret.table.body[rowInd + j]) {
                              while (cs--)
                                ret.table.body[rowInd + j].splice(
                                  columnInd,
                                  0,
                                  { text: "" }
                                );
                            } else {
                              // if we have an empty <tr></tr>
                              cell.rowSpan--;
                            }
                          }
                          // increase rowInd to skip processed rows
                          rowInd += len - 1;
                        }
                      }
                    }
                  }
                }
              }
            }

            delete ret.stack;
            delete ret.text;
            // apply all the inhirent classes and styles from the parents, or for the current element
            ret = this.applyStyle({
              ret: ret,
              parents: parents.concat([element]),
            });

            // if option tableAutoSize, then we try to apply the correct width/height on the table
            if (this.tableAutoSize) {
              var cellsWidths: any = [];
              var cellsHeights: any = [];
              var tableWidths: any = [];
              var tableHeights: any = [];

              // remove everything from percent string except numbers and dot
              var tableWidth =
                element.getAttribute("width") || element.style.width;
              // check if table have width defined
              var tableHavePctWidth = tableWidth.endsWith("%");
              if (tableHavePctWidth) {
                // get only numbers of percentage
                tableWidth = Math.round(
                  this.getParentWidth(element) *
                    parseFloat(tableWidth.replace(/[^\d\.]/g, "")) *
                    0.01
                );
                console.log(this.maxWidth, tableWidth);
              } else if (isNaN(tableWidth))
                tableWidth = HtmlToPdfMake.convertToUnit(tableWidth);

              var tableHaveColgroup = false;
              var tableColgroupIndex = -1;
              // check if any of table children is a colgroup with cells widths
              for (var x = 0; x < element.children.length; x++) {
                var child = element.children[x];
                if (!tableHaveColgroup) tableColgroupIndex++;
                if (child.nodeName.toUpperCase() === "COLGROUP")
                  tableHaveColgroup = true;
              }

              ret.table.body.forEach(function (row: any, rowIndex: number) {
                cellsWidths.push([]);
                cellsHeights.push([]);
                row.forEach(function (cell: any, cellIndex: number) {
                  // we want to remember the different sizes
                  var width =
                    typeof cell.width !== "undefined" ? cell.width : "auto";
                  if (width === "*") width = "auto"; // tinymce could generate 'width:*', but it's invalid, so we use 'auto' instead
                  var height =
                    typeof cell.height !== "undefined" ? cell.height : "auto";
                  if (height === "*") height = "auto"; // tinymce could generate 'height:*', but it's invalid, so we use 'auto' instead
                  // check if we have colspan or rowspan
                  // if yes, and if width/height is a number, we divide by the col/rowspan, otherwise we use 'auto'
                  if (width !== "auto" && cell.colSpan > 1) {
                    if (!isNaN(width)) width /= cell.colSpan;
                    else width = "auto";
                  }
                  if (height !== "auto" && cell.rowSpan > 1) {
                    if (!isNaN(height)) height /= cell.rowSpan;
                    else height = "auto";
                  }
                  cellsWidths[rowIndex].push(width);
                  cellsHeights[rowIndex].push(height);
                });
              });
              // if we have colgroups defining cells widths
              if (tableHaveColgroup) {
                var colGroups = element.children[tableColgroupIndex];
                [].forEach.call(
                  colGroups.childNodes,
                  (colElement: any, index: number) => {
                    var colWidth =
                      colElement.getAttribute("width") ||
                      colElement.style.width;
                    if (colWidth.endsWith("%")) {
                      // update cell width to its percentage in colgroup
                      tableWidths[index] =
                        parseFloat(colWidth.replace(/[^\d\.]/g, "")) *
                        0.01 *
                        this.getParentWidth(element);
                    } else {
                      tableWidths[index] =
                        HtmlToPdfMake.convertToUnit(colWidth);
                    }
                  }
                );
              }
              // determine the max width for each cell
              cellsWidths.forEach(function (row: any) {
                row.forEach(function (cellWidth: any, cellIndex: number) {
                  var type = typeof tableWidths[cellIndex];
                  if (
                    type === "undefined" ||
                    (cellWidth !== "auto" &&
                      type === "number" &&
                      cellWidth > tableWidths[cellIndex]) ||
                    (cellWidth !== "auto" && tableWidths[cellIndex] === "auto")
                  ) {
                    if (tableHavePctWidth) {
                      // if table have defined widths we need to make a
                      // rule of three to get cell's proportional width
                      cellWidth =
                        cellWidth === "auto"
                          ? tableWidth / row.length
                          : cellWidth.toString().replace("%", "") *
                            0.01 *
                            tableWidth;
                    }
                    tableWidths[cellIndex] = cellWidth;
                  }
                });
              });
              // determine the max height for each row
              cellsHeights.forEach(function (row: any, rowIndex: number) {
                row.forEach(function (cellHeight: any) {
                  var type = typeof tableHeights[rowIndex];
                  if (
                    type === "undefined" ||
                    (cellHeight !== "auto" &&
                      type === "number" &&
                      cellHeight > tableHeights[rowIndex]) ||
                    (cellHeight !== "auto" && tableHeights[rowIndex] === "auto")
                  ) {
                    tableHeights[rowIndex] = cellHeight;
                  }
                });
              });
              if (tableWidths.length > 0)
                ret.table.widths = tableWidths.map(
                  (w: number) =>
                    Math.round((w - tableWidths.length * 2) * 100) * 0.01 // 实在没有办法了，只能在这硬性减了
                );
              if (tableHeights.length > 0) ret.table.heights = tableHeights;
            }

            // check if we have some data-pdfmake to apply
            if (element.dataset && element.dataset.pdfmake) {
              // handle when people will use simple quotes, e.g. <table data-pdfmake="{'layout':'noBorders'}">
              dataset = element.dataset.pdfmake.replace(/'/g, '"');
              try {
                dataset = JSON.parse(dataset);
                for (key in dataset) {
                  if (key === "layout") {
                    ret.layout = dataset[key];
                  } else {
                    ret.table[key] = dataset[key];
                  }
                }
              } catch (e) {
                console.error(e);
              }
            } else {
              ret.layout = "html-table";
            }
            break;
          }
          case "TH":
          case "TD": {
            if (element.getAttribute("rowspan"))
              ret.rowSpan = element.getAttribute("rowspan") * 1;
            if (element.getAttribute("colspan"))
              ret.colSpan = element.getAttribute("colspan") * 1;
            break;
          }
          case "SVG": {
            ret = {
              svg: element.outerHTML.replace(/\n(\s+)?/g, ""),
              nodeName: "SVG",
            };
            if (!this.removeTagClasses) ret.style = ["html-svg"];
            break;
          }
          case "BR": {
            // for BR we return '\n'
            ret.text = [{ text: "\n" }];
            break;
          }
          case "SUB":
          case "SUP": {
            ret[nodeName.toLowerCase()] = { offset: "30%", fontSize: 8 };
            break;
          }
          case "HR": {
            // default style for the HR
            var styleHR: any = {
              width: 514,
              type: "line",
              margin: [0, 12, 0, 12],
              thickness: 0.5,
              color: "#000000",
              left: 0,
            };
            // we can override the default HR style with "data-pdfmake"
            if (element.dataset && element.dataset.pdfmake) {
              dataset = element.dataset.pdfmake.replace(/'/g, '"');
              try {
                dataset = JSON.parse(dataset);
                for (key in dataset) {
                  styleHR[key] = dataset[key];
                }
              } catch (e) {
                console.error(e);
              }
            }

            ret.margin = styleHR.margin;
            ret.canvas = [
              {
                type: styleHR.type,
                x1: styleHR.left,
                y1: 0,
                x2: styleHR.width,
                y2: 0,
                lineWidth: styleHR.thickness,
                lineColor: styleHR.color,
              },
            ];
            delete ret.text;

            break;
          }
          case "OL":
          case "UL": {
            ret[nodeNameLowerCase] = (ret.stack || ret.text).slice(0);
            delete ret.stack;
            delete ret.text;
            // apply all the inhirent classes and styles from the parents, or for the current element
            ret = this.applyStyle({
              ret: ret,
              parents: parents.concat([element]),
            });
            // check if we have `start`
            if (element.getAttribute("start")) {
              ret.start = element.getAttribute("start") * 1;
            }
            // check if we have "type"
            switch (element.getAttribute("type")) {
              case "A":
                ret.type = "upper-alpha";
                break;
              case "a":
                ret.type = "lower-alpha";
                break;
              case "I":
                ret.type = "upper-roman";
                break;
              case "i":
                ret.type = "lower-roman";
                break;
            }

            // check if we have `list-style-type` or `list-style`
            if (ret.listStyle || ret.listStyleType)
              ret.type = ret.listStyle || ret.listStyleType;
            break;
          }
          case "LI": {
            // if it's a stack, then check if the last child has a "text"
            if (ret.stack && !ret.stack[ret.stack.length - 1].text) {
              // if not, we restructure our node
              // by moving the non-stack stuff inside a "text"
              text = ret.stack.slice(0, -1);
              ret = [
                { text: text }, // (Array.isArray(text) ? {"stack": text} : {"text": text}),
                ret.stack[ret.stack.length - 1],
              ];
            }
            // we don't want a child of UL/OL to be an array, but it should be a "stack"
            if (Array.isArray(ret)) {
              ret = { stack: ret };
            }
            break;
          }
          case "PRE": {
            ret.preserveLeadingSpaces = true;
            break;
          }
          case "IMG": {
            // apply all the inhirent classes and styles from the parents, or for the current element
            ret = this.applyStyle({
              ret: ret,
              parents: parents.concat([element]),
            });
            if (this.imagesByReference) {
              var src =
                element.getAttribute("data-src") || element.getAttribute("src");
              var index = this.imagesRef.indexOf(src);
              if (index > -1)
                ret.image = "img_ref_" + this.imagesByReferenceSuffix + index;
              else {
                ret.image =
                  "img_ref_" +
                  this.imagesByReferenceSuffix +
                  this.imagesRef.length;
                this.imagesRef.push(src);
              }
            } else {
              ret.image = element.getAttribute("src");
            }
            delete ret.stack;
            delete ret.text;

            break;
          }
          case "A": {
            // the link must be applied to the deeper `text` or stacked element (e.g. `image`)
            var setLink = function (pointer: any, href: string) {
              pointer = pointer || { text: "" }; // for link without any text
              if (Array.isArray(pointer.text)) {
                pointer.text = pointer.text.map(function (text: any) {
                  return setLink(text, href);
                });
                return pointer;
              } else if (Array.isArray(pointer.stack)) {
                // if we have a more complex layer
                pointer.stack = pointer.stack.map(function (stack: any) {
                  return setLink(stack, href);
                });
                return pointer;
              }
              // if 'href' starts with '#' then it's an internal link
              if (href.indexOf("#") === 0)
                pointer.linkToDestination = href.slice(1);
              else pointer.link = href;
              return pointer;
            };
            if (element.getAttribute("href")) {
              ret = setLink(ret, element.getAttribute("href"));
              // reduce the complexity when only 1 text
              if (Array.isArray(ret.text) && ret.text.length === 1)
                ret = ret.text[0];
              ret.nodeName = "A";
            }
            break;
          }
          default: {
            // handle other cases
            if (
              nodeName === "DIV" &&
              element.dataset &&
              element.dataset.pdfmakeType === "columns"
            ) {
              // if it's a <DIV> with data-pdfmake-type="columns"
              // then we interpret it as the COLUMNS in PDFMake
              if (ret.stack) {
                ret.columns = ret.stack;
                delete ret.stack;
              }
            } else if (typeof this.customTag === "function") {
              // handle custom tags
              ret = this.customTag.call(this, {
                element: element,
                parents: parents,
                ret: ret,
              });
            }
          }
        }

        // reduce the number of JSON properties
        if (
          Array.isArray(ret.text) &&
          ret.text.length === 1 &&
          ret.text[0].text &&
          !ret.text[0].nodeName
        ) {
          ret.text = ret.text[0].text;
        }

        // check if we have some data-pdfmake to apply
        if (
          ["HR", "TABLE"].indexOf(nodeName) === -1 &&
          element.dataset &&
          element.dataset.pdfmake
        ) {
          // handle when people will use simple quotes
          dataset = element.dataset.pdfmake.replace(/'/g, '"');
          try {
            dataset = JSON.parse(dataset);
            for (key in dataset) {
              ret[key] = dataset[key];
            }
          } catch (e) {
            console.error(e);
          }
        }

        return ret;
      }
    }
  }

  /**
   * Apply style and classes from all the parents
   *
   * @param  {Object} params
   *   @param {Object} ret The object that will receive the 'style' and other properties
   *   @param {Array} parents Array of node elements
   * @return {Object} the modified 'ret'
   */
  applyStyle(params: any): any {
    var cssClass: string[] = [];
    var lastIndex = params.parents.length - 1;
    var _this = this;
    params.parents.forEach(function (parent: any, parentIndex: number) {
      // classes
      var parentNodeName = parent.nodeName.toLowerCase();
      if (!_this.removeTagClasses) {
        var htmlClass = "html-" + parentNodeName;
        if (htmlClass !== "html-body" && cssClass.indexOf(htmlClass) === -1)
          cssClass.unshift(htmlClass);
      }
      var parentClass: Array<string> = (
        parent.getAttribute("class") || ""
      ).split(" ");
      parentClass.forEach(function (p: string) {
        if (p) cssClass.push(p);
      });
      // styles
      var style;
      // not all the CSS properties should be inherent
      var ignoreNonDescendentProperties = parentIndex !== lastIndex;
      // 1) the default styles
      if (_this.defaultStyles[parentNodeName]) {
        for (style in _this.defaultStyles[parentNodeName]) {
          if (_this.defaultStyles[parentNodeName].hasOwnProperty(style)) {
            if (
              !ignoreNonDescendentProperties ||
              (ignoreNonDescendentProperties &&
                style.indexOf("margin") === -1 &&
                style.indexOf("border") === -1)
            ) {
              // 'decoration' can be an array
              if (style === "decoration") {
                if (!Array.isArray(params.ret[style])) params.ret[style] = [];
                // do not apply twice the same (e.g. applying 2 "underline" will cause an extra blank space with an underline)
                if (
                  _this.defaultStyles[parentNodeName][style] &&
                  params.ret[style].indexOf(
                    _this.defaultStyles[parentNodeName][style]
                  ) === -1
                ) {
                  params.ret[style].push(
                    _this.defaultStyles[parentNodeName][style]
                  );
                }
              } else {
                params.ret[style] = JSON.parse(
                  JSON.stringify(_this.defaultStyles[parentNodeName][style])
                );
              }
            }
          }
        }
      }
      // 2) element's style
      // we want TD/TH to receive descendant properties from TR
      if (parentNodeName === "tr") ignoreNonDescendentProperties = false;
      style = _this.parseStyle(parent, ignoreNonDescendentProperties);
      style.forEach(function (stl) {
        // 'decoration' can be an array
        if (stl.key === "decoration") {
          if (!Array.isArray(params.ret[stl.key])) params.ret[stl.key] = [];
          params.ret[stl.key].push(stl.value);
        }
        // ignore the "alignment" for the <ol> and <ul> elements (see https://github.com/Aymkdn/html-to-pdfmake/issues/245)
        else if (
          ["ul", "ol"].includes(parentNodeName) &&
          stl.key === "alignment"
        ) {
          // do nothing
        } else {
          // when 'params.ret.margin' is defined but also a 'marginXYZ' is defined in `stl.key`,
          // then we should change the correct index in `params.ret.margin` to reflect it
          if (params.ret.margin && stl.key.indexOf("margin") === 0) {
            // order: left | top | right | bottom
            switch (stl.key) {
              case "marginLeft":
                params.ret.margin[0] = stl.value;
                break;
              case "marginTop":
                params.ret.margin[1] = stl.value;
                break;
              case "marginRight":
                params.ret.margin[2] = stl.value;
                break;
              case "marginBottom":
                params.ret.margin[3] = stl.value;
                break;
            }
          } else if (!["minHeight"].includes(stl.key)) {
            params.ret[stl.key] = stl.value;
          }
        }
      });
    });
    if (cssClass.length > 0) params.ret.style = cssClass;
    return params.ret;
  }

  /**
   * Border Value Rearrange a CSS expression (e.g. 'border:solid 10px red' to 'border:10px solid red')
   *
   * @param {String} styleStr The CSS expression values
   * @returns {String} border value in global accepted format (e.g. 'border:10px solid red')
   */
  borderValueRearrange(styleStr: string): string {
    try {
      var styleArray = styleStr.split(" ");
      if (styleArray.length !== 3) return styleStr;
      var v1 = "0px",
        v2 = "none",
        v3 = "transparent";
      var style = [
        "dotted",
        "dashed",
        "solid",
        "double",
        "groove",
        "ridge",
        "inset",
        "outset",
        "none",
        "hidden",
        "mix",
      ];
      styleArray.forEach(function (v) {
        if (v.match(/^\d/)) {
          v1 = v;
        } else if (style.indexOf(v) > -1) {
          v2 = v;
        } else {
          v3 = v;
        }
      });
      return v1 + " " + v2 + " " + v3;
    } catch (e) {
      return styleStr;
    }
  }

  /**
   * Transform a CSS expression (e.g. 'margin:10px') in the PDFMake version
   *
   * @param {String} style The CSS expression to transform
   * @param {DOMElement} element
   * @param {Boolean} ignoreProperties TRUE when we have to ignore some properties, like border, padding, margin
   * @returns {Array} array of {key, value}
   */
  parseStyle(element: any, ignoreProperties?: boolean): any[] {
    var style = element.getAttribute("style") || "";
    var ret = [];
    style = style.replace(/!important/g, "").split(";");
    // check if we have "width" or "height"
    var width = element.getAttribute("width") || element.style.width;
    var height = element.getAttribute("height") || element.style.height;
    if (width) {
      if (width.endsWith("%"))
        width =
          this.getParentWidth(element) *
          parseFloat(width.replace(/[^\d\.]/g, "")) *
          0.01;
      else if (isNaN(width)) width = HtmlToPdfMake.convertToUnit(width);
      style.unshift("width:" + width);
    }
    if (height) {
      style.unshift(
        "height:" +
          HtmlToPdfMake.convertToUnit(height + (isNaN(height) ? "" : "px"))
      );
    }
    // check if we have 'color' or 'size' -- mainly for '<font>'
    var color = element.getAttribute("color");
    if (color) {
      ret.push({ key: "color", value: HtmlToPdfMake.parseColor(color).color });
    }
    var size = element.getAttribute("size");
    if (size !== null) {
      // Getting and sanitizing the size value: it should be included between 1 and 7
      size = Math.min(Math.max(1, parseInt(size)), 7);
      // Assigning the font size
      ret.push({
        key: "fontSize",
        value: Math.max(this.fontSizes[0], this.fontSizes[size - 1]),
      });
    }

    var styleDefs = style.map(function (style: string) {
      return style.toLowerCase().split(":");
    });
    var borders: any[] = []; // special treatment for borders
    var nodeName = element.nodeName.toUpperCase();
    var _this = this;
    styleDefs.forEach(function (styleDef: string[]) {
      if (styleDef.length === 2) {
        var key = styleDef[0].trim().toLowerCase();
        var value: string | number | false = styleDef[1].trim();
        var res;
        if (_this.ignoreStyles.indexOf(key) === -1) {
          switch (key) {
            case "margin": {
              if (ignoreProperties) break;
              // pdfMake uses a different order than CSS
              let values: Array<string | number | false> = value.split(" ");
              if (values.length === 1)
                values = [values[0], values[0], values[0], values[0]];
              else if (values.length === 2) values = [values[1], values[0]];
              // vertical | horizontal ==> horizontal | vertical
              else if (values.length === 3)
                values = [values[1], values[0], values[1], values[2]];
              // top | horizontal | bottom ==> left | top | right | bottom
              else if (values.length === 4)
                values = [values[3], values[0], values[1], values[2]]; // top | right | bottom | left ==> left | top | right | bottom

              // we now need to convert to PT
              values.forEach(function (val: any, i: number) {
                // PDFMake doesn't support "auto" as a margin value
                if (val === "auto") values[i] = "";
                else values[i] = HtmlToPdfMake.convertToUnit(val);
              });
              // ignore if we have a FALSE in the table
              if (values.indexOf(false) === -1)
                ret.push({ key: key, value: value });
              break;
            }
            case "line-height": {
              // change % unit
              if (typeof value === "string" && value.slice(-1) === "%") {
                value = parseFloat(value.slice(0, -1)) / 100;
              } else {
                value = HtmlToPdfMake.convertToUnit(value);
              }
              ret.push({ key: "lineHeight", value: value });
              break;
            }
            case "text-align": {
              ret.push({ key: "alignment", value: value });
              break;
            }
            case "font-weight": {
              if (value === "bold") ret.push({ key: "bold", value: true });
              break;
            }
            case "text-decoration": {
              // verify the value is valid
              value = HtmlToPdfMake.toCamelCase(value);
              if (["underline", "lineThrough", "overline"].includes(value)) {
                ret.push({ key: "decoration", value: value });
              }
              break;
            }
            case "font-style": {
              if (value === "italic") ret.push({ key: "italics", value: true });
              break;
            }
            case "font-family": {
              ret.push({
                key: "font",
                value: value
                  .split(",")[0]
                  .replace(/"|^'|^\s*|\s*$|'$/g, "")
                  .replace(/^([a-z])/g, function (g) {
                    return g[0].toUpperCase();
                  })
                  .replace(/ ([a-z])/g, function (g) {
                    return g[1].toUpperCase();
                  }),
              });
              break;
            }
            case "color": {
              res = HtmlToPdfMake.parseColor(value);
              ret.push({ key: "color", value: res.color });
              if (res.opacity < 1)
                ret.push({ key: "opacity", value: res.opacity });
              break;
            }
            case "background-color": {
              // if TH/TD and key is 'background', then we use 'fillColor' instead
              res = HtmlToPdfMake.parseColor(value);
              ret.push({
                key:
                  nodeName === "TD" || nodeName === "TH"
                    ? "fillColor"
                    : "background",
                value: res.color,
              });
              if (res.opacity < 1)
                ret.push({
                  key:
                    nodeName === "TD" || nodeName === "TH"
                      ? "fillOpacity"
                      : "opacity",
                  value: res.opacity,
                });
              break;
            }
            case "text-indent": {
              ret.push({
                key: "leadingIndent",
                value: HtmlToPdfMake.convertToUnit(value),
              });
              break;
            }
            case "white-space": {
              if (value === "nowrap") {
                ret.push({ key: "noWrap", value: true });
              } else {
                ret.push({
                  key: "preserveLeadingSpaces",
                  value:
                    value === "break-spaces" || value.slice(0, 3) === "pre",
                });
              }
              break;
            }
            default: {
              // do we have borders properties?
              if (key.indexOf("border") === 0) {
                if (!ignoreProperties) borders.push({ key: key, value: value });
              } else {
                // ignore some properties
                if (
                  ignoreProperties ||
                  key.indexOf("margin-") === 0 ||
                  key === "width" ||
                  key === "height"
                )
                  break;

                // for IMG only (see issue #181)
                if (
                  nodeName === "IMG" &&
                  (key === "width" || key === "height")
                ) {
                  ret.push({
                    key: key,
                    value: HtmlToPdfMake.convertToUnit(value),
                  });
                  break;
                }

                // padding is not supported by PDFMake
                if (key.indexOf("padding") === 0) break;
                if (key.indexOf("-") > -1) key = HtmlToPdfMake.toCamelCase(key);
                if (value) {
                  // convert value to a 'pt' when possible
                  var parsedValue = HtmlToPdfMake.convertToUnit(value);
                  // if we have 'font-size' with a parsedValue at false, then:
                  // check if it's one of know keywords (like medium, small, x-small, etc), otherwise ignore it
                  if (key === "fontSize" && parsedValue === false) {
                    if (
                      [
                        "xx-small",
                        "x-small",
                        "small",
                        "medium",
                        "large",
                        "x-large",
                        "xx-large",
                        "xxx-large",
                      ].includes(value)
                    ) {
                      // we use 12pt as the medium value
                      switch (value) {
                        case "xx-small":
                          value = 7.2;
                          break; // 60%
                        case "x-small":
                          value = 9;
                          break; // 75%
                        case "small":
                          value = 10.7;
                          break; // 89%
                        case "medium":
                          value = 12;
                          break;
                        case "large":
                          value = 14.4;
                          break; // 120%
                        case "x-large":
                          value = 18;
                          break; // 150%
                        case "xx-large":
                          value = 24;
                          break; // 200%
                        case "xxx-large":
                          value = 36;
                          break; // 300%
                      }
                    } else {
                      break;
                    }
                  }
                  // PDFMake doesn't support "auto" as a value for "margin" (at least)
                  if (key.indexOf("margin") === 0 && value === "auto") break;
                  ret.push({
                    key: key,
                    value: parsedValue === false ? value : parsedValue,
                  });
                }
              }
            }
          }
        }
      }
    });
    // deal with the borders
    if (borders.length > 0) {
      // pdfmake supports only 2 properties:
      //  - "border" (true/false) to indicate if the border should be visible
      //  - "borderColor" (string) to indicate the color of the border
      var border = []; // array of boolean
      var borderColor = []; // array of colors
      borders.forEach(function (b) {
        var index = -1,
          i;
        // determine if the current property is for 'border-left', or 'border-right', or 'border-top', or 'border-bottom'
        if (b.key.indexOf("-left") > -1) index = 0;
        else if (b.key.indexOf("-top") > -1) index = 1;
        else if (b.key.indexOf("-right") > -1) index = 2;
        else if (b.key.indexOf("-bottom") > -1) index = 3;

        // for 'border', 'border-left', 'border-right', 'border-top', and 'border-bottom', then we should have three values: width style color
        // so we try to find them
        var splitKey = b.key.split("-"),
          properties,
          width;
        if (
          splitKey.length === 1 /* border */ ||
          (splitKey.length === 2 &&
            index >= 0) /* border-left|right|top|bottom */
        ) {
          b.value = _this.borderValueRearrange(b.value);
          properties = b.value.split(" ");
          width = properties[0]
            .replace(/(\d*)(\.\d+)?([^\d]+)/g, "$1$2 ")
            .trim();

          // for the width
          if (index > -1) {
            border[index] = width > 0;
          } else {
            for (i = 0; i < 4; i++) border[i] = width > 0;
          }
          // for the color
          if (properties.length > 2) {
            var color = properties.slice(2).join(" ");
            if (index > -1) {
              borderColor[index] = HtmlToPdfMake.parseColor(color).color;
            } else {
              for (i = 0; i < 4; i++)
                borderColor[i] = HtmlToPdfMake.parseColor(color).color;
            }
          }
        }
        // otherwise it means we could have a specific value for a specific property
        // e.g. 'border-left-color' or 'border-top-width'
        // only 'color' and 'width' are supported
        else if (index >= 0 && splitKey[2] === "color") {
          borderColor[index] = HtmlToPdfMake.parseColor(b.value).color;
        } else if (index >= 0 && splitKey[2] === "width") {
          border[index] = !/^0[a-z%]*$/.test(String(b.value));
        }
        // otherwise we could have 'border-color' or 'border-width'
        else if (b.key === "border-color") {
          properties = HtmlToPdfMake.topRightBottomLeftToObject(b.value);
          borderColor = [
            HtmlToPdfMake.parseColor(properties.left).color,
            HtmlToPdfMake.parseColor(properties.top).color,
            HtmlToPdfMake.parseColor(properties.right).color,
            HtmlToPdfMake.parseColor(properties.bottom).color,
          ];
        } else if (b.key === "border-width") {
          properties = HtmlToPdfMake.topRightBottomLeftToObject(b.value);
          border = [
            !/^0[a-z%]*$/.test(properties.left),
            !/^0[a-z%]*$/.test(properties.top),
            !/^0[a-z%]*$/.test(properties.right),
            !/^0[a-z%]*$/.test(properties.bottom),
          ];
        }
      });
      // fill the gaps
      for (var i = 0; i < 4; i++) {
        if (border.length > 0 && typeof border[i] === "undefined")
          border[i] = true;
        if (borderColor.length > 0 && typeof borderColor[i] === "undefined")
          borderColor[i] = "#000000";
      }
      if (border.length > 0) ret.push({ key: "border", value: border });
      if (borderColor.length > 0)
        ret.push({ key: "borderColor", value: borderColor });
    }
    return ret;
  }
}
