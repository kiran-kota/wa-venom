const express = require('express');
const bodyParser = require("body-parser");
const { phoneNumberFormatter } = require('./helpers/formatter');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const venom = require('venom-bot');
const app = express();

app.use(express.static(__dirname + '/'));
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.set('views', __dirname);
app.use(cors());

var server = http.createServer(app);    
var io = socketIO(server);

const PORT = process.env.PORT || 3300;

let clients = [];
function createSession(ssId){
    venom.create(
        ssId, 
        (base64Qrimg, asciiQR, attempts, urlCode) => {
          
            console.log('Number of attempts to read the qrcode: ', attempts);
            io.emit('qr', {id: ssId, url: base64Qrimg});
            io.emit('message', {id: ssId, text: 'QR Code received, scan please!'});       
            io.emit('message', {id: ssId, text: 'Number of attempts to read the qrcode: ' + attempts});        
        },
        (statusSession, session) => {
            console.log('Status Session: ', statusSession);
            console.log('Session name: ', session);
            io.emit('message', {id: ssId, text: statusSession});
            io.emit(statusSession, {id: session, text: statusSession})    
        },
        {
        multidevice: true,
        folderNameToken: 'tokens',
        headless: true,
        devtools: false,
        useChrome: false,
        debug: false,
        logQR: false,
        browserArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
        disableSpins: true, 
        disableWelcome: true, 
        updatesLog: true,
        autoClose: 0,
        createPathFileToken: true,
        chromiumVersion: '818858',
        waitForLogin: true
        },
        (browser, waPage) => {
            console.log('Browser PID:', browser.process().pid);
            waPage.screenshot({ path: 'screenshot.png' });
        }
    ).then((client)=>{ 
        client.onStateChange(state => {
            clients = clients.filter(x=>x.id != ssId);
            clients.push({id: ssId, waclient: client}); 
            console.log('State changed: ', state);
            if(state == 'CONNECTED'){
                
            }
            // force whatsapp take over
            if ('CONFLICT'.includes(state)) client.useHere();
            // detect disconnect on whatsapp
            if ('UNPAIRED'.includes(state)) console.log('logout');
            io.emit('message', {id: ssId, text: state});
        });
        //start(client);
    }).catch((erro)=>{
        console.log(erro);
    });
    
}
app.get('/', (req, res)=>res.send('welcome'));

app.get('/session/:id', (req, res)=>{    
    var id = req.params.id;
    res.render('session.html', {id: id});
});



app.post('/send-message', async (req, res)=>{
    try {

        var result = await sendMessage(req.body);
        if(result.status == null){
            return res.status(422).json(result); 
        }else{
            return res.status(200).json(result);
        }
    } catch (error) {
        return res.status(422).json(error); 
    }
});


async function sendMessage(sendObj) {
    try {
        var report = null;
        const number = phoneNumberFormatter(sendObj.number);
        const message = sendObj.message;
        const sender = sendObj.sender;
        const id = sendObj.id;
        const file = sendObj.file;
        const filename = sendObj.filename;
        var waclient = clients.find(x=>x.id == id)?.waclient;
        if(waclient == null || waclient == undefined){
            return {status: null, message: 'client not available'}; 
        }
        const chat = await waclient?.checkNumberStatus(number).then((result) =>result).catch((err) => console.error(err, 'error'));
        if(chat == null || chat == undefined){
            return {status: false, message: 'invalid mobile number'};
        }
        if(sender == "text"){
           report = await waclient.sendText(number, message).then((result) => result).catch((err) => console.error(err, 'error'));
        } 
        if(sender == "media"){
            report = await waclient.sendImage(number, file, filename, message).then((result) => result).catch((err) => console.error(err, 'error'));
        }
       
        if(report == null || report == undefined){
            return {status: null, message: 'something went wrong'}; 
        }
        return {status: true, message: 'message sent successfully'};
    } catch (error) {
        console.log(error);
        return {status: null, message: 'client not available'}; 
    }
}


io.on('connection', function(socket){
    socket.on('create-session', function(data){
        console.log(data, 'socket data');
        io.emit('message', {id: data.id, text: 'loading...'});
        let found = clients.find(x=>x.id == data.id);
        console.log(found, 'found');
        if(found == null){       
            clients.push({id: data.id, waclient: null});
            io.emit('message', {id: data.id, text: 'client is not available'});
            createSession(data.id);
        }
        io.emit('message', {id: data.id, text: 'please wait checking client status'});
    })
})


server.listen(PORT, ()=>console.log('server started at ' + PORT));
