import AWS from "aws-sdk";

AWS.config.update({ region: "us-west-2" });

const translate = new AWS.Translate();

const stringifyValue = (value) => {
  if (typeof value === "function") {
    // Within this branch, `value` has type `Function`,
    // so we can access the function's `name` property
    const functionName = value.name || "(anonymous)";
    return `[function ${functionName}]`;
  }

  if (value instanceof Date) {
    // Within this branch, `value` has type `Date`,
    // so we can call the `toISOString` method
    return value.toISOString();
  }

  return String(value);
};

export const translateToJaByAws = async (text) => {
  const params = {
    SourceLanguageCode: "auto",
    TargetLanguageCode: "ja",
    Text: text,
  };
  const callTranslate = (reqParams) => {
    return new Promise((res, rej) => {
      translate.translateText(reqParams, function (err, data) {
        if (err) {
          console.log(err, err.stack);
          rej(err);
        }
        // console.log(data["TranslatedText"]);
        res(data["TranslatedText"]);
      });
    });
  };
  const result = await callTranslate(params);
  return stringifyValue(result);
};
