import * as fs from "fs";
import "dotenv/config";

import { fromMarkdown } from "mdast-util-from-markdown";
import { toMarkdown } from "mdast-util-to-markdown";
import { frontmatter } from "micromark-extension-frontmatter";
import {
  frontmatterFromMarkdown,
  frontmatterToMarkdown,
} from "mdast-util-frontmatter";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { get_encoding } from "tiktoken";

import { getMdFileList, writeFileSync } from "./lib.js";
import { executeLangLinkTranslator } from "./openaiTranslate.js";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const createNewRoot = () => ({ type: "root", children: [] });

const translateSingleMdToJa = async (filePath) => {
  const mdFileContent = fs.readFileSync(filePath).toString();
  const [meta, content] = splitMetaContent(mdFileContent);

  const headings = extractHeadings(content);
  const contentSegments = contentSplit(content, "heading")
    .map((seg) =>
      seg.skip
        ? seg
        : // preserve \n from openai output
          // \n\nabc\nbcd\n -> ['', '', 'abc\nbcd', ''].join('\n')
          seg.content
            .split(/^\n+|\n+$/g)
            .map((c) => ({ content: c, skip: !!c ? seg.skip : true }))
    )
    .flat();

  // console.log(contentSegments);
  // return;

  const dataArr = await Promise.all(
    contentSegments.map((seg) => {
      if (seg.skip) {
        return Promise.resolve(seg.content);
      }
      return executeLangLinkTranslator(seg.content);
    })
  );
  // console.log(dataArr);
  // return;
  const data = dataArr.join("\n").trim();
  const result = concatHeadings(data, headings);
  const contentWithMeta = `${meta}\n${result}`;

  writeFileSync(`output/${filePath}`, contentWithMeta);
};

const metaReg = /---\n/;

const splitMetaContent = (originalText) => {
  const [_, meta, ...content] = originalText.split(metaReg);
  if (!meta) {
    return [undefined, originalText];
  }
  return [`---\n${meta}---\n`, content.join("---\n")];
};

const fromMarkdownContent = (content) =>
  fromMarkdown(content, {
    extensions: [frontmatter(["yaml", "toml"]), gfm()],
    mdastExtensions: [
      frontmatterFromMarkdown(["yaml", "toml"]),
      gfmFromMarkdown(),
    ],
  });

const toMarkdownContent = (astNode) =>
  toMarkdown(astNode, {
    bullet: "-",
    extensions: [frontmatterToMarkdown(["yaml", "toml"]), gfmToMarkdown()],
  });

const MAX_TOKEN = 1024;
const TIKTOKEN_ENCODING = "cl100k_base";

const createSegment = (content, skip = false) => ({ content, skip });
const skipTypes = ["code"];

const contentSplit = (content, by) => {
  const enc = get_encoding(TIKTOKEN_ENCODING);
  const numTokens = enc.encode(content).length;
  if (numTokens < MAX_TOKEN) {
    return [createSegment(content)];
  }

  const root = fromMarkdownContent(content);
  const segments = [];
  let segment = createNewRoot();
  const pushSegmentContent = () => {
    const segmentContent = toMarkdownContent(segment);
    const numTokens = enc.encode(segmentContent).length;
    if (numTokens > MAX_TOKEN) {
      console.log(`Too large paragraph:\n${segmentContent.slice(0, 100)}...`);
    }

    segments.push(createSegment(segmentContent, numTokens > MAX_TOKEN));
    segment.children = [];
  };
  root.children.forEach((node) => {
    const tempSegment = createNewRoot();
    tempSegment.children = [...segment.children, node];
    const tempSegmentContent = toMarkdownContent(tempSegment);
    const tempNumTokens = enc.encode(tempSegmentContent).length;
    const willReachLimit = tempNumTokens > MAX_TOKEN;

    if (
      (node.type === by && !!segment.children.length && willReachLimit) ||
      willReachLimit
    ) {
      pushSegmentContent();
      segment.children.push(node);
      return;
    }

    if (skipTypes.includes(node.type)) {
      pushSegmentContent();
      // insert skip node into segments
      const newRoot = createNewRoot();
      newRoot.children.push(node);
      segments.push(createSegment(toMarkdownContent(newRoot), true));
      return;
    }

    segment.children.push(node);
  });

  if (!!segment.children.length) {
    pushSegmentContent();
  }

  return segments;
};

const extractHeadings = (content) => {
  const root = fromMarkdownContent(content);
  return root.children
    .filter((node) => node.type === "heading")
    .map((node) => ({
      level: node.depth,
      content: enStr2AnchorFormat(toMarkdownContent(node)),
    }));
};

const concatHeadings = (content, headings) => {
  const root = fromMarkdownContent(content);
  const contentHeadings = root.children.filter(
    (node) => node.type === "heading"
  );
  // console.log(headings.length);
  // console.log(contentHeadings.length);

  headings.forEach((heading, index) => {
    const contentHeading = contentHeadings[index];
    if (contentHeading.depth !== heading.level) {
      throw new Error(
        `The wrong level has been matched. Heading level: ${heading.level}, text: ${heading.content}; Content Heading level: ${contentHeading.depth}, text: ${contentHeading.children[0].value}`
      );
    }
    contentHeading.children.push({
      type: "text",
      value: ` {#${heading.content}}`,
    });
  });

  return toMarkdown(root, {
    bullet: "-",
    extensions: [frontmatterToMarkdown(["yaml", "toml"]), gfmToMarkdown()],
  });
};

const enStr2AnchorFormat = (headingStr) => {
  // trim spaces and transform characters to lower case
  const text = headingStr.trim().toLowerCase();
  // \W is the negation of shorthand \w for [A-Za-z0-9_] word characters (including the underscore)
  const result = text.replace(/[\W_]+/g, "-").replace(/^-+|-+$/g, "");
  return result;
};

const copyable = /{{< copyable\s+(.+)\s+>}}\r?\n/g;
const replaceDeprecatedContent = (path) => {
  const mdFileContent = fs.readFileSync(path).toString();
  fs.writeFileSync(path, mdFileContent.replace(copyable, ""));
};

const main = async () => {
  const srcList = getMdFileList("markdowns");

  for (let filePath of srcList) {
    console.log(filePath);
    replaceDeprecatedContent(filePath);
    await translateSingleMdToJa(filePath);
  }

  // await Promise.all(
  //   srcList.map((filePath) => {
  //     console.log(filePath);
  //     replaceDeprecatedContent(filePath);
  //     return translateSingleMdToJa(filePath);
  //   })
  // );
};

main();
