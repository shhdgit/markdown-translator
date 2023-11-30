const LANGLINK_HEADERS = {
  "Content-Type": "application/json",
  "x-langlink-access-key": process.env.LANGLINK_ACCESS_KEY,
  "x-langlink-access-secret": process.env.LANGLINK_ACCESS_SECRET,
  "x-langlink-user": process.env.LANGLINK_USER,
};

const GPT35_APP_ID = "daa61a60-75d1-494a-bde4-ee78d8c18803";
const OUTPUT_NODE_ID = "uXt40e3y1KhhHEKW-gmSN";
const RERUN_TIME = 3;
const RETRY_INTERVAL = 5000;
const RETRY_TIME = 12;

export const executeLangLinkTranslator = (input) => {
  return new Promise((resolve, reject) => {
    const rerunLoop = async (rerunTime = 0) => {
      try {
        const result = await runLangLinkTranslator(input);
        resolve(result);
      } catch {
        if (rerunTime < RERUN_TIME) {
          rerunLoop(++rerunTime);
        } else {
          reject(new Error(`Maximum rerun attempts reached: ${RERUN_TIME}.`));
        }
      }
    };
    rerunLoop();
  });
};

const runLangLinkTranslator = async (input) => {
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
    throw new Error(JSON.stringify(data));
  }
  return data.debug;
};
