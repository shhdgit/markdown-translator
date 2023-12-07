import * as fs from "fs";

import { fromMarkdown } from "mdast-util-from-markdown";
import { toMarkdown } from "mdast-util-to-markdown";
import { frontmatter } from "micromark-extension-frontmatter";
import {
  frontmatterFromMarkdown,
  frontmatterToMarkdown,
} from "mdast-util-frontmatter";
// import { mdxjs } from "micromark-extension-mdxjs";
// import { mdxFromMarkdown, mdxToMarkdown } from "mdast-util-mdx";
// import { gfmTable } from "micromark-extension-gfm-table";
// import { gfmTableFromMarkdown, gfmTableToMarkdown } from "mdast-util-gfm-table";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { visit } from "unist-util-visit";
// import {
//   comment,
//   commentFromMarkdown,
//   commentToMarkdown,
// } from "remark-comment-o";

import { getMdFileList, writeFileSync, handleAstNode } from "./lib.js";

const pSum = {
  sum: 0,
  _data: [],
};

export const gcpTranslator = async (filePath) => {
  const mdFileContent = fs.readFileSync(filePath);
  const mdAst = fromMarkdown(mdFileContent, {
    // extensions: [frontmatter(["yaml", "toml"]), gfmTable, gfm()],
    extensions: [frontmatter(["yaml", "toml"]), gfm()],
    mdastExtensions: [
      frontmatterFromMarkdown(["yaml", "toml"]),
      // gfmTableFromMarkdown,
      gfmFromMarkdown(),
    ],
  });

  const treeNodes = [];
  visit(mdAst, (node) => {
    treeNodes.push(node);
  });

  // treeNodes.forEach((node) => {
  //   if (node.type === "paragraph") {
  //     pSum.sum = pSum.sum + 1;
  //     const children = node.children;
  //     children?.forEach((c) => {
  //       const type = c.type;
  //       pSum[type] = pSum[type] ? pSum[type] + 1 : 1;
  //       if (type === "linkReference") pSum._data.push(node);
  //     });
  //   }
  // });

  // treeNodes.forEach((node) => {
  //   node.type === "html" && console.log(node);
  // });

  await Promise.all(
    treeNodes.map(async (d) => {
      await handleAstNode(d);
    })
  );

  const newFile = toMarkdown(mdAst, {
    bullet: "-",
    extensions: [
      frontmatterToMarkdown(["yaml", "toml"]),
      // gfmTableToMarkdown(),
      gfmToMarkdown(),
    ],
  });
  const result = newFile.replaceAll(/(#+.+)(\\{)(#.+})/g, `$1{$3`);
  writeFileSync(`output/${filePath}`, result);
};

const copyable = /{{< copyable\s+(.+)\s+>}}\r?\n/g;
const replaceDeprecatedContent = (path) => {
  const mdFileContent = fs.readFileSync(path).toString();
  fs.writeFileSync(path, mdFileContent.replace(copyable, ""));
};

// root
// paragraph
// heading
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

// const main = async () => {
//   const srcList = getMdFileList("markdowns");
//   // console.log(srcList);

//   for (let a of srcList) {
//     console.log(a);
//     replaceDeprecatedContent(a);
//     await translateSingleMdToJa(a);
//     // break;
//   }

//   // console.log(pSum);
// };

// main();
