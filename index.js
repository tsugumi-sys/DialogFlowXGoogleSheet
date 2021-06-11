// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';
 
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const {google} = require('googleapis');
const axios = require('axios');
const querystring = require('querystring');
 
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

// Configuration and other Parameters
const serviceAccount = {
  "private_key": "*****",
  "client_email": "*****"
};
const sheetId = '*****';
const sheets = google.sheets('v4');
const calendarId = '*****'
const calendar = google.calendar('v3');
const timeZone = 'Asia/Tokyo';
const timeZoneOffset = '-09:00';
const cw_token = '*****';
const room_id = '*****';


// Authorization with GCP service account (IMA roll is full)
const auth = new google.auth.JWT({
  email: serviceAccount.client_email,
  key: serviceAccount.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/calendar']
});

// Create a New Event on Google Calendar
// See https://cloud.google.com/dialogflow/es/docs/tutorials/build-an-agent/create-fulfillment-using-webhook?hl=ja
function createCalendarEvent(dateTimeStart, dateTimeEnd) {
  return new Promise((resolve, reject) => {
    calendar.events.list({
      // List all events in the specified period
      auth: auth,
      calendarId: calendarId,
      timeMin: dateTimeStart.toISOString(),
      timeMax: dateTimeEnd.toISOString()
    }, (err, calendarResponse) => {
      if (err || calendarResponse.data.items.length > 0) {
        reject(err || new Error('Requested time conflicts with another appointment'));
      } else {
        // Create an event for the requested time period
        calendar.events.insert({
          auth: auth,
          calendarId: calendarId,
          resource: {
            summary: 'Appointment',
            start: { dateTime: dateTimeStart },
            end: { dateTime: dateTimeEnd }
          }
        }, (err, event) => {
          err ? reject(err) : resolve(event);
        })
      }
    })
  })
}

function convertParametersDate(date, time) {
  return new Date(Date.parse(date.split('T')[0] + 'T' + time.split('T')[1].split('-')[0] + timeZoneOffset));
};

function addHours(dateObj, hoursToAdd){
  return new Date(new Date(dateObj).setHours(dateObj.getHours() + hoursToAdd));
};

function getLocaleTimeString(dateObj){
  return dateObj.toLocaleTimeString('en-US', {hour: 'numeric', hour12: true, timeZone: timeZone });
};

function getLocaleDateString(dateObj){
  return dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: timeZone });
};


function addHoursToDate(date, hours) {
  const newDate = new Date(date);
  newDate.setHours(newDate.getHours() + hours);
  return newDate;
}


function sendChatwork(items){
  let body = `[info][title]件名: LINEよりお問い合わせがありました。[/title]`;
  for (var key in items) {
  	body += `[info][title]${key}[/title]${items[key]}[/info]`;
  }
  body += `[/info]`;
  
  axios(
    {
      method: 'post',
      url: `https://api.chatwork.com/v2/rooms/${room_id}/messages`,
      headers: {
        'X-ChatWorkToken': cw_token
      },
      data: querystring.stringify({
        body: body
      })
    }
  )
  .then((res) => {
    console.log(res.data);
  })
  .catch((err) => {
    console.error(err);
  });
}


exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
  
  // Save to Google Sheets ans Send the results to ChatWork
  async function SendToSheets(agent) {
    const name = agent.parameters.name;
    const email = agent.parameters.email;
    const content = agent.parameters.content;
    const utc_dt = new Date();
    const jst_dt = addHoursToDate(utc_dt, 9);
    
    
    sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
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
      "日付": jst_dt.toLocaleString('en-US', {hour12: false}),
      "お名前": name,
      "メールアドレス": email,
      "相談内容": content
    };
    sendChatwork(items);
    
    console.log(jst_dt.toLocaleString('en-US', {hour12: false}), name, email, content);
  }

  // Appointment function using Google Calendar
  async function makeAppointment(agent) {
    const appointmentDuration = 1
    const dateTimeStart = convertParametersDate(agent.parameters.date, agent.parameters.time);
    const dateTimeEnd = addHours(dateTimeStart, appointmentDuration);
    const appointmentTimeString = getLocaleDateString(dateTimeStart);
    const appointmentDateString = getLocaleDateString(dateTimeStart);

    return createCalendarEvent(dateTimeStart, dateTimeEnd)
    .then(() => {
      agent.add(`Got it. I have your appointment scheduled on ${appointmentDateString} at ${appointmentTimeString}. See you soon. Good-bye.`);
    })
    .catch(() => {
      agent.add(`Sorry, we are booked on ${appointmentDateString} at ${appointmentTimeString}. Is there anything else I can do for you?`);
    });
  }


  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Inquery', SendToSheets);
  intentMap.set('inquery-inherit-email', SendToSheets);
  intentMap.set('inquery-FamilyTrust-email', SendToSheets);
  intentMap.set('inquery-Company-email', SendToSheets);
  intentMap.set('inquery-Else-email', SendToSheets);
  intentMap.set('Make Appointment', makeAppointment);
  agent.handleRequest(intentMap);
});
