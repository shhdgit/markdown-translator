import * as fs from "fs";
import "dotenv/config";
import { get_encoding } from "tiktoken";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export const translateSingleMdToJa = async (filePath) => {
  const mdFileContent = fs.readFileSync(filePath).toString();
  const [meta, content] = splitMetaContent(mdFileContent);
  const headings = extractHeadings(content);
  const contentSegments = preserveLineBreak(binarySplitByToken(content));

  const dataArr = await Promise.all(contentSegments.map(runLangLinkTranslator));
  const data = dataArr.join("\n").trim();
  const result = concatHeadings(data, headings);
  const contentWithMeta = `${meta}\n${result}`;

  writeFileSync(`output/${filePath}`, contentWithMeta);
};

const writeFileSync = (destPath, fileContent) => {
  const dir = path.dirname(destPath);

  if (!fs.existsSync(dir)) {
    // console.info(`Create empty dir: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(destPath, fileContent);
};

const metaReg = /---\s*\n/;

const splitMetaContent = (originalText) => {
  const [_, meta, content] = originalText.split(metaReg);
  return [`---\n${meta}---\n`, content];
};

const LANGLINK_HEADERS = {
  "Content-Type": "application/json",
  "x-langlink-access-key": process.env.LANGLINK_ACCESS_KEY,
  "x-langlink-access-secret": process.env.LANGLINK_ACCESS_SECRET,
  "x-langlink-user": process.env.LANGLINK_USER,
};

const GPT35_APP_ID = "24fcccc8-f4a1-4e01-bc67-098398296613";
const OUTPUT_NODE_ID = "uXt40e3y1KhhHEKW-gmSN";
const TIKTOKEN_ENCODING = "cl100k_base";
const MAX_TOKEN = 1900;
const RETRY_INTERVAL = 5000;
const RETRY_TIME = 60;

const runLangLinkTranslator = async (input) => {
  if (input === "") {
    return Promise.resolve("");
  }

  const res = await fetch(
    `https://langlink.pingcap.net/langlink-api/applications/${GPT35_APP_ID}/async`,
    {
      method: "POST",
      body: JSON.stringify({ input }),
      headers: LANGLINK_HEADERS,
    }
  );
  const data = await res.json();
  const retryPromise = new Promise((resolve, reject) => {
    const getLangLinkResultLoop = async (retryTime = 0) => {
      const result = await getLangLinkResult(data.id);
      if (!result.length) {
        if (retryTime < RETRY_TIME) {
          setTimeout(() => {
            getLangLinkResultLoop(++retryTime);
          }, RETRY_INTERVAL);
        } else {
          reject(new Error(`Maximum retry attempts reached: ${RETRY_TIME}.`));
        }
        return;
      }
      resolve(result.find((node) => node.block === OUTPUT_NODE_ID).output);
    };
    getLangLinkResultLoop();
  });

  return retryPromise;
};

const getLangLinkResult = async (id) => {
  const res = await fetch(
    `https://langlink.pingcap.net/langlink-api/applications/${GPT35_APP_ID}/debug/${id}`,
    {
      method: "GET",
      headers: LANGLINK_HEADERS,
    }
  );
  const data = await res.json();
  if (res.status !== 200) {
    throw new Error(data);
  }
  return data.debug;
};

const binarySplitByToken = (text, separator = "\n") => {
  const enc = get_encoding(TIKTOKEN_ENCODING);
  const numTokens = enc.encode(text).length;
  if (numTokens < MAX_TOKEN) {
    return [text];
  }

  const textArr = text.split(separator);
  if (textArr.filter((t) => !!t).length < 2) {
    throw new Error(`Too large paragraph. Content: ${text}`);
  }

  const pivot = Math.floor(textArr.length / 2);
  return [
    ...binarySplitByToken(textArr.slice(0, pivot).join(separator)),
    ...binarySplitByToken(textArr.slice(pivot).join(separator)),
  ];
};

// \n\nabc\nbcd\n -> ['', '', 'abc\nbcd', ''].join('\n')
const preserveLineBreak = (contentSegments) =>
  contentSegments.map((seg) => seg.split(/^\n+|\n+$/g)).flat();

// # Heading 1
// ## Heading 2
// ### Heading 3
// #### Heading 4
// ##### Heading 5
// ###### Heading 6
const headingReg = /^(#{1,6})\s(.+)$/gm;

const extractHeadings = (originalText) => {
  const headings = [];
  let match;

  while ((match = headingReg.exec(originalText)) !== null) {
    const headingLevel = match[1].length;
    const headingText = match[2];
    headings.push({
      level: headingLevel,
      text: enStr2AnchorFormat(headingText),
    });
  }

  return headings;
};

const concatHeadings = (originalText, headings) => {
  let matchIndex = 0;
  const replacedText = originalText.replace(
    headingReg,
    (match, level, title) => {
      const heading = headings[matchIndex];
      if (level.length !== heading.level) {
        throw new Error(
          `The wrong level has been matched. Original level: ${level}, text: ${title}; input level: ${heading.level}, text: ${heading.text}`
        );
      }
      matchIndex++;
      return `${match} {#${heading.text}}`;
    }
  );
  return replacedText;
};

const enStr2AnchorFormat = (headingStr) => {
  // trim spaces and transform characters to lower case
  const text = headingStr.trim().toLowerCase();
  // \W is the negation of shorthand \w for [A-Za-z0-9_] word characters (including the underscore)
  const result = text.replace(/[\W_]+/g, "-").replace(/^-+|-+$/g, "");
  return result;
};
