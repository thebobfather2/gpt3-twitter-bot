const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
admin.initializeApp();

// Database reference
const dbRef = admin.firestore().doc("tokens/demo");

// Twitter API init
const TwitterApi = require("twitter-api-v2").default;
const twitterClient = new TwitterApi({
  clientId: "VW1TTTR3cDdqdTRXWE5SM2VtcFg6MTpjaQ",
  clientSecret: "IC88nlnDL561z5sG-3TCPH6WbBQ1TGXv9-bSH8cTi_GdRnqNGF",
});

const callbackURL = "https://us-central1-twitterbot-1657b.cloudfunctions.net/callback";

// OpenAI API init
const {Configuration, OpenAIApi} = require("openai");
const configuration = new Configuration({
  organization: "org-WFMD6W2WHbattkTcWiAcFSLD",
  apiKey: "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",
});
const openai = new OpenAIApi(configuration);

// STEP 1 - Auth URL
exports.auth = functions.https.onRequest(async (request, response) => {
  const {url, codeVerifier, state} = twitterClient.generateOAuth2AuthLink(
      callbackURL,
      {scope: ["tweet.read", "tweet.write", "users.read", "offline.access"]},
  );


  // store verifier
  await dbRef.set({codeVerifier, state});

  response.redirect(url);
});

// STEP 2 - Verify callback code, store access_token
exports.callback = functions.https.onRequest(async (request, response) => {
  const {state, code} = request.query;

  const dbSnapshot = await dbRef.get();
  const {codeVerifier, state: storedState} = dbSnapshot.data();

  if (state !== storedState) {
    return response.status(400).send("Stored tokens do not match!");
  }

  const {
    client: loggedClient,
    accessToken,
    refreshToken,
  } = await twitterClient.loginWithOAuth2({
    code,
    codeVerifier,
    redirectUri: callbackURL,
  });

  await dbRef.set({accessToken, refreshToken});

  const {data} = await loggedClient.v2.me();

  response.send(data);
});

// STEP 3 - Refresh tokens and post tweets
// Sample array of prompts
const prompts = [
  "as an obvious joke, disagree with an obvious scientific fact please",
  "admit to something taboo and embarassing that would shock most people",
  "invent a conspiracy that helen keller was not real",
  "suggest a conspiracy about cookie monster",
  "claim sour patch kids were invented in tempe and are made of actual kids",
  // "hype up cyptocurrency",
  // "insult other rappers but as if you were 5 years old",
  // "gush over pepe the frog how awesome he is",
  // "defend why everyone needs pepe coin",
  // "tweet rap lyrics in the style of drake about memecoins and crypto",
  // "promote the upcoming launch of Switchyard Sessions '@joerianmusic'",
  // "talk about how awesome '@joerianmusic' is",
  // "tell people to go follow '@vibestreamnetwork'",
  // "tell people to go follow '@joerianmusic'",
  // "give credit to elon musk",
  // "say 'gm' and then add trending hashtags after",
  // "promote the coming launch of the Switchyard Sessions '@joerianmusic'",
  // "tell people to check out vibestreamlegends.com",
  // "let people know to check out the new merch at vibestreamlegends.com",
  // "let people know there's cool merch at vibestreamlegends.com",

  // Add more prompts here
];

exports.tweet = functions.https.onRequest(async (request, response) => {
  const {refreshToken} = (await dbRef.get()).data();

  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken,
  } = await twitterClient.refreshOAuth2Token(refreshToken);

  await dbRef.set({accessToken, refreshToken: newRefreshToken});

  // Randomly select a prompt from the array
  const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

  const nextTweet = await openai.createCompletion("text-davinci-003", {
    prompt: "pretend you are dj khaled" + randomPrompt,
    max_tokens: 64,
  });

  const {data} = await refreshedClient.v2.tweet(nextTweet.data.choices[0].text);

  response.send(data);
});

exports.scheduledTweet = functions.pubsub
    .schedule("every 1 hours") // Replace '1 hours' with the desired interval
    .timeZone("Etc/UTC") // Set the timezone to match your needs
    .onRun(async (context) => {
      try {
        const result = await axios.get("https://us-central1-twitterbot-1657b.cloudfunctions.net/tweet");
        console.log("Tweet result:", result.data);
        return null;
      } catch (error) {
        console.error("Error calling tweet function:", error);
        return null;
      }
    });
