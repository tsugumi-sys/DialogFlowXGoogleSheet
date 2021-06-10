// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';
 
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const {google} = require('googleapis');
const axios = require('axios');
 
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

const serviceAccount = {
  "private_key": 'YOUR_PRIVATE_KEY',
  "client_email": 'YOUR_EMAIL_ACCOUNT'
};
const sheet_id = 'YOUR_SHEET_ID';
const sheets = google.sheets('v4');


const auth = new google.auth.JWT({
  email: serviceAccount.client_email,
  key: serviceAccount.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']
});


const client = google.sheets({ version: 'v4', 'auth': auth });


function addHoursToDate(date, hours) {
  const newDate = new Date(date);
  newDate.setHours(newDate.getHours() + hours);
  return newDate;
}


function sendChatwork(items){
  const cw_token = 'YOUR_CHATWORK_TOKEN';
  const room_id = 'YOUR_ROOM_ID';
  const instance = axios.create({
    baseURL: 'https://api.chatwork.com/v2/',
    timeout: 1000,
    headers: {'X-ChatWorkToken': cw_token}
  });
  let body = `[info][title]件名: LINEよりお問い合わせがありました。[/title]`;
  for (var key in items) {
  	body += `[info][title]${key}: ${items[key]}[/title][/info]`;
  }
  body += `[/info]`;
  const data = {
    body: body
  };
  instance.post(`rooms/${room_id}/messages`, data)
    .then(function (res) {
      console.log('Send Chatwork', res.status);
      console.log(res.statusText);
    })
    .catch(function (err){
      if (err.response) {
        console.log(err.response.data);
        console.log(err.response.status);
        console.log(err.response.headers);
      } else if (err.request) {
        console.log(err.request);
      } else {
        console.log('Error', err.message);
      }
      console.log(err.config);
    });
}


exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
 
  function welcome(agent) {
    agent.add(`Welcome to my agent!`);
  }
 
  function fallback(agent) {
    agent.add(`I didn't understand`);
    agent.add(`I'm sorry, can you try again?`);
  }
  
  async function SendToSheets(agent) {
    const name = agent.parameters.name;
    const email = agent.parameters.email;
    const content = agent.parameters.content;
    const utc_dt = new Date();
    const jst_dt = addHoursToDate(utc_dt, 9);
    
    
    sheets.spreadsheets.values.append({
      spreadsheetId: sheet_id,
      range: 'Sheet1!A:D',
      valueInputOption: 'USER_ENTERED',
      resource: {
        "values": [
          [jst_dt.toLocaleString('en-US', {hour12: false}), name, email, content] 
       ]
      },
      auth: auth,
    }, (err, res) => {
      if (err) {
        console.error(err);
      } else {
        console.log(res);
      }
    });
    
    const items = {
      "日付": jst_dt,
      "お名前": name,
      "email": email,
      "内容": content
    };
    sendChatwork(items);
    
    console.log(jst_dt, name, email, content);
  }

  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('Inquery', SendToSheets);
  intentMap.set('inquery-inherit-email', SendToSheets);
  intentMap.set('inquery-FamilyTrust-email', SendToSheets);
  intentMap.set('inquery-Company-email', SendToSheets);
  intentMap.set('inquery-Else-email', SendToSheets);
  agent.handleRequest(intentMap);
});
