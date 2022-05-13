import * as fs from "fs";
import _ from "lodash";
import path from "path";
import glob from "glob";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkHtml from "remark-html";
import rehypeRaw from "rehype-raw";

import { toHast } from "mdast-util-to-hast";
import rehypeStringify from "rehype-stringify";

import { mdxFromMarkdown, mdxToMarkdown } from "mdast-util-mdx";
import {
  frontmatterFromMarkdown,
  frontmatterToMarkdown,
} from "mdast-util-frontmatter";
import { gfmTableFromMarkdown, gfmTableToMarkdown } from "mdast-util-gfm-table";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";

import { toMarkdown } from "mdast-util-to-markdown";

import { translateSingleText } from "./gcpTranslate.js";

const generateNoTranslateTag = (src) => {
  return `<span translate="no">{{B-NOTRANSLATE-${src}-NOTRANSLATE-E}}</span>`;
};

const getMds = (src) => {
  return glob.sync(src + "/**/*.md");
};

export const getMdFileList = (prefix) => {
  return getMds(prefix);
};

export const writeFileSync = (destPath, fileContent) => {
  const dir = path.dirname(destPath);

  if (!fs.existsSync(dir)) {
    // console.info(`Create empty dir: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(destPath, fileContent);
};

// heading
// paragraph
// thematicBreak
// blockquote
// list
// listItem
// table
// tableRow
// tableCell
// html
// code
// yaml
// definition
// footnoteDefinition
// text
// emphasis
// strong
// delete
// inlineCode
// break
// link
// image
// linkReference
// imageReference
// footnote
// footnoteReference

export const handleAstNode = (node) => {
  switch (node.type) {
    case "heading":
      return handleHeadings(node);
      break;
    case "paragraph":
      return handleParagraph(node);
      break;
    case "tableCell":
      return handleParagraph(node);
      break;
    default:
      // console.log(node);
      break;
  }
};

// docs {
//   sum: 217507,
//   yaml: 802,
//   heading: 6984,
//   paragraph: 34051,
//   html: 2765,
//   list: 5623,
//   text: 82235,
//   strong: 1984,
//   listItem: 22692,
//   link: 11261,
//   inlineCode: 27295,
//   table: 429,
//   tableRow: 3703,
//   tableCell: 11292,
//   code: 4027,
//   blockquote: 790,
//   emphasis: 130,
//   image: 551,
//   definition: 50,
//   linkReference: 39,
//   thematicBreak: 1
// }

// docs paragraph {
//   sum: 34051,
//   text: 52747,
//   strong: 1954,
//   link: 10259,
//   inlineCode: 22869,
//   emphasis: 89,
//   image: 551,
//   html: 133,

//   linkReference: 3
// {type: 'linkReference', children: Array(1), position: {…}, label: 'RFC 4180', identifier: 'rfc 4180', …}
// children:(1) [{…}]
// identifier:'rfc 4180'
// label:'RFC 4180'
// position:{start: {…}, end: {…}}
// referenceType:'shortcut'
// type:'linkReference'

// }

const handleParagraph = async (paragraphNode) => {
  // TODO: handle linkReference
  const metadata = await paragraphIntegratePlaceholder(paragraphNode.children);

  const paragraphHtml = await mdSnippet2html(paragraphNode);
  const trimParagraphHtml = trimHtmlTags(paragraphHtml);
  const HTMLStr = updateHTMLNoTransStr(trimParagraphHtml);
  const [output] = await translateSingleText(HTMLStr, "text/html");
  // console.log(translatedHTMLStr);
  const translatedHTMLStr = undoUpdateHTMLNoTransStr(output);
  const translatedHTMLStrWithBr = updateBrTag(translatedHTMLStr);
  const newChildren = retriveByPlaceholder(translatedHTMLStrWithBr, metadata);
  paragraphNode.children = newChildren;
};

const paragraphIntegratePlaceholder = async (children) => {
  // type PhrasingContent = HTML | Link | LinkReference | Text | Emphasis | Strong | Delete | InlineCode | Break | Image | ImageReference | Footnote | FootnoteReference
  const meta = {};
  for (let idx = 0; idx < children.length; idx++) {
    const child = children[idx];
    switch (child.type) {
      case "link":
        const linkchildCopy = _.cloneDeep(child);
        const linkHtml = await mdSnippet2html(child);
        const linkHtmlStr = trimHtmlTags(linkHtml);
        // const aTagLeft = /^<[^>]+>/.exec(linkHtmlStr)[0];
        const hrefValue = linkHtmlStr.match(
          /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/
        )[2];
        const [linkHtmlStrInside] = await translateSingleText(
          trimHtmlTags(linkHtmlStr),
          "text/html"
        );
        child.type = "html";
        child.value = generateNoTranslateTag(idx);
        linkchildCopy.type = "html";
        linkchildCopy.value = `[${inlineHtml2mdStr(
          linkHtmlStrInside
        )}](${hrefValue})`;
        meta[idx] = linkchildCopy;
        break;
      case "linkReference":
      // const linkRefchildCopy = _.cloneDeep(child);
      // child.type = "html";
      // child.value = generateNoTranslateTag(idx);
      // meta[idx] = linkRefchildCopy;
      // break;
      case "inlineCode":
      // const inlineCodechildCopy = _.cloneDeep(child);
      // child.type = "html";
      // child.value = generateNoTranslateTag(idx);
      // meta[idx] = inlineCodechildCopy;
      // break;
      case "image":
      case "imageReference":
      // const imageChildCopy = _.cloneDeep(child);
      // child.type = "html";
      // child.value = generateNoTranslateTag(idx);
      // meta[idx] = imageChildCopy;
      // break;
      case "footnote":
      case "footnoteReference":
        const nodeChildCopy = _.cloneDeep(child);
        child.type = "html";
        child.value = generateNoTranslateTag(idx);
        meta[idx] = nodeChildCopy;
        break;
      default:
        break;
    }
  }
  return meta;
};

const retriveByPlaceholder = (resultStr, meta) => {
  return resultStr.split(/({{B-|-E}})/g).reduce((prev, item) => {
    if (item.startsWith("{{B-") || item.endsWith("-E}}")) return prev;
    if (item.startsWith("PLACEHOLDER-") && item.endsWith("-PLACEHOLDER")) {
      const originIdx = parseInt(item.replace(/(PLACEHOLDER|-)/g, ""));
      const originItem = meta[originIdx];
      switch (originItem.type) {
        default:
          prev.push(originItem);
          break;
      }
    } else {
      prev.push({
        type: "html",
        value: item,
      });
    }
    return prev;
  }, []);
};

const enStr2AnchorFormat = (headingStr) => {
  // trim spaces and transform characters to lower case
  const text = headingStr.trim().toLowerCase();
  // \W is the negation of shorthand \w for [A-Za-z0-9_] word characters (including the underscore)
  const result = text.replace(/[\W_]+/g, "-").replace(/^-+|-+$/g, "");
  return result;
};

const headingTextExactCustomId = async (headingNode) => {
  const headingHtml = await mdSnippet2html(headingNode);
  const headingStr = trimHtmlTags(headingHtml);
  headingNode.HTMLStr = headingStr;
  const customIdRegex = /{#.+}$/;
  // Ignore if already has a custom id
  if (customIdRegex.test(headingStr)) {
    const customIdStr = /{#(.+)}$/.exec(headingStr)[1];
    headingNode.customId = customIdStr;
    return;
  }
  headingNode.customId = enStr2AnchorFormat(headingStr);
};

const concatHeadingCustomId = async (headingNode) => {
  const children = headingNode?.children || [];
  const child = children?.[0];
  const customId = headingNode?.customId;
  if (customId) {
    child.value = `${child.value} {#${customId}}`;
  }
};

const handleHeadings = async (node) => {
  await headingTextExactCustomId(node);
  const HTMLStr = node.HTMLStr;
  const [translatedHTMLStr] = await translateSingleText(HTMLStr, "text/html");
  node.children = [
    {
      type: "html",
      value: translatedHTMLStr,
    },
  ];
  await concatHeadingCustomId(node);
};

const mdSnippet2html = async (mdNode) => {
  const mdStr = astNode2mdStr(mdNode);
  const result = await unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    // .use(remarkRehype)
    // .use(remarkHtml)
    .use(rehypeStringify)
    .process(mdStr);

  return result.value;
};

const astNode2mdStr = (astNode) => {
  const result = toMarkdown(astNode, {
    bullet: "-",
    extensions: [
      mdxToMarkdown(),
      frontmatterToMarkdown(["yaml", "toml"]),
      // gfmTableToMarkdown(),
      gfmToMarkdown(),
    ],
  });
  // const result = newFile.replaceAll(/(#+.+)(\\{)(#.+})/g, `$1{$3`);
  return result;
};

const trimHtmlTags = (htmlStr) => {
  // src: <h1>TiDB Experimental Features <em>a</em> <strong>b</strong> ~~c~~ <code>d</code> 123456 </h1>
  // result: TiDB Experimental Features <em>a</em> <strong>b</strong> ~~c~~ <code>d</code> 123456
  return htmlStr
    .trim()
    .replace(/^<[^>]+>/, "")
    .replace(/<\/[^>]+>$/, "")
    .trim();
};

const inlineHtml2mdStr = (HTMLStr = "") => {
  // type PhrasingContent = Text | Emphasis | Strong | Delete | InlineCode | Break
  return HTMLStr.replace(`<strong>`, `**`)
    .replace(`</strong>`, `**`)
    .replace(`<code>`, "`")
    .replace(`</code>`, "`")
    .replace(`<em>`, `*`)
    .replace(`</em>`, `*`)
    .replace(`<del>`, `~~`)
    .replace(`</del>`, `~~`);
};

const updateHTMLNoTransStr = (HTMLStr) => {
  // {{B-NOTRANSLATE-${src}-NOTRANSLATE-E}}
  // return HTMLStr.replaceAll(
  //   `{{B-NOTRANSLATE-`,
  //   `<span translate="no">`
  // ).replaceAll(`-NOTRANSLATE-E}}`, `</span>`);
  return HTMLStr.replaceAll(`{{B-NOTRANSLATE-`, ``).replaceAll(
    `-NOTRANSLATE-E}}`,
    ``
  );
};

const undoUpdateHTMLNoTransStr = (HTMLStr) => {
  // ...<span translate="no">0</span>...
  return HTMLStr.replaceAll(
    /<span translate="no">([0-9]+)<\/span>/g,
    (_, p1) => {
      return `{{B-PLACEHOLDER-${p1}-PLACEHOLDER-E}}`;
    }
  );
};

// Gatsby will raise SyntaxError: unknown: Expected corresponding JSX closing tag for <br>.
const updateBrTag = (src) => {
  return src.replaceAll(`<br>`, `<br/>`);
};
