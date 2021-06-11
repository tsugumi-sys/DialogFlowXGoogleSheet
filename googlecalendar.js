const {google, calendar_v3} = require('googleapis');
const calendarId = '*******'
const serviceAccount = {
    "private_key": "*****",
    "client_email": "******"
};

const auth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: 'https://www.googleapis.com/auth/calendar'
});

const agent = {
    parameters: {
        date: '2021-06-11T00:00',
        time: '2021-06-11T04:30'
    }
};

const calendar = google.calendar('v3')
const timeZone = 'Asia/Tokyo'
const timeZoneOffset = '+09:00'

const appointmentDuration = 1;
const dateTimeStart = convertParamatersDate(agent.parameters.date, agent.parameters.time);
const dateTimeEnd = addHours(dateTimeStart, appointmentDuration);
const appointmentTimeString = getLocaleTimeString(dateTimeStart);
const appointmentDateString = getLocaleDateString(dateTimeStart);
console.log(dateTimeStart, dateTimeEnd)

createCalendarEvent(dateTimeStart, dateTimeEnd)
.then(() => {
    console.log('New Event Added to Calendar')
})
.catch((err) => {
    console.error(err);
})

function createCalendarEvent (dateTimeStart, dateTimeEnd) {
    return new Promise((resolve, reject) => {
        calendar.events.list({
            // List all events in the specified time period
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


function convertParamatersDate(date, time){
    return new Date(Date.parse(date.split('T')[0] + 'T' + time.split('T')[1].split('-')[0] + timeZoneOffset));   
}

function addHours(dateObj, hoursToAdd){
    return new Date(new Date(dateObj).setHours(dateObj.getHours() + hoursToAdd));
}

function getLocaleTimeString(dateObj){
    return dateObj.toLocaleTimeString('en-US', {hour: 'numeric', hour12: true, timeZone: timeZone});
}

function getLocaleDateString(dateObj){
    return dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: timeZone });
}