import * as fs from "fs";
import "dotenv/config";

export const translateSingleMdToJa = async (filePath) => {
  const mdFileContent = fs.readFileSync(filePath).toString();
  const headings = extractHeadings(mdFileContent);
  const res = await fetch(
    "https://langlink.pingcap.net/langlink-api/applications/2ab16937-ef06-42b1-a2ea-c46f645c5d98",
    {
      method: "POST",
      body: JSON.stringify({ input: mdFileContent }),
      headers: {
        "Content-Type": "application/json",
        "x-langlink-access-key": process.env.LANGLINK_ACCESS_KEY,
        "x-langlink-access-secret": process.env.LANGLINK_ACCESS_SECRET,
        "x-langlink-user": process.env.LANGLINK_USER,
      },
    }
  );
  const data = await res.json();
  if (!data.output) {
    throw new Error(`No output, response data: ${JSON.stringify(data)}`);
  }
  const result = concatHeadings(data.output.trim(), headings);
  writeFileSync(`output/${filePath}`, result);
};

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
