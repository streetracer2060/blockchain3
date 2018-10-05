'use strict';
var CryptoJS = require("crypto-js");
var express = require("express");
var bodyParser = require('body-parser');
var WebSocket = require("ws");
var fs = require('fs');
var https = require('https');
var path = require('path');

var key_   = fs.readFileSync('/root/ssl/p.key', 'utf8');
var cert_  = fs.readFileSync('/root/ssl/s.cert', 'utf8');

var http_port = process.env.HTTP_PORT || 80;//3000;
var ws_port = process.env.WS_PORT || 3000;

var server_wss_secure = https.createServer({key: key_, cert: cert_}, express);
server_wss_secure.listen(ws_port, function(){
    console.log('Listening wss connection on *: '+ws_port);
});

initBlockchain();

var DEFAULT_TRANSACTION_TYPE = "generation";

var io = require('socket.io')(server_wss_secure);
io.on('connection', function(socket){
    console.log('user connected');

    io.emit('raw_blockchain_data', raw_blockchain_data);
    io.emit('total_coins', coinGenerated);
    socket.on('disconnect', function(){
        console.log('user disconnected');
    });
});

io.on('connection', function(socket){
    socket.on('new_block_message', function( obj_){
        console.log(obj_.amount + " " + obj_.message);
        var res = tryAddNewBlockToBlockchain( obj_);
        console.log("block was added to blockchain: " + res);
    });

    socket.on('blockchain_manual_update_message', function( obj_){
        
       
        console.log(obj_.blockchain_data);
        var data1 = obj_.blockchain_data;
        if (isJsonStringValid( data1) ) {
            writeBlockchainToFile( data1);
            io.emit('on_manual_update',true);
        }
        else {
            io.emit('on_manual_update',false);
        }
    });
});

class Block {
    constructor(index, previousHash, timestamp, block_transaction/*data*/, hash) {
        this.index = index;//genesis block index is: 1
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.transaction = block_transaction;
        this.hash = hash.toString();
    }
}

class Transaction {
    constructor(timestamp, hash, data, blockID) {
        this.blockIndex = blockID;
        this.transaction_hash = hash;
        this.received_time = timestamp;
        this.transaction_data = data;
        this.type = DEFAULT_TRANSACTION_TYPE;//another transaction type is: coin transfer
    }
}

var getGenesisBlock = () => {
    var transaction_data = '{"amount":1000, "message":"The Times 05/Oct/2018 Chancellor on brink of second bailout for banks"}';
    var genesis_transaction_data = JSON.parse(transaction_data);
    var time_ = 1538729315;
    var trHash = calculateHashOfTransactionData(time_, genesis_transaction_data, DEFAULT_TRANSACTION_TYPE,1);
    var transaction = new Transaction(time_, trHash, genesis_transaction_data,1);
    return new Block(1, "0", time_, transaction, "c435a50988167a0249b57dc1ac3f0773ae75cd292ef7bb2d16d674dcca40f374");
};

// var blockchain = [getGenesisBlock()];
var blockchain = [];
var raw_blockchain_data;
var coinGenerated = 0;

var initHttpServer = () => {
    var app = express();
    app.use(bodyParser.json());

    app.get('/blocks', (req, res) => { 

        res.send(JSON.stringify(blockchain)); 
    });

    app.get('/transactions', (req, res) => { 
        res.send(JSON.stringify(getTransactionList() )); 
    });
    app.post('/addNewBlock', (req, res) => {
        var newBlockData = req.body.data;
        tryAddNewBlockToBlockchain(newBlockData);

        console.log('block added: ' + JSON.stringify(newBlock));
        res.send();
    });
    
    app.use('/assets', express.static(path.join(__dirname, 'assets')));
    app.get('/', function(req, res) {
      res.sendFile(__dirname + '/index.html');
    });

    app.listen(http_port, () => console.log('Listening http on port *: ' + http_port));
};

var generateNextBlock = (new_transaction_data) => {
    var prevBlock = getLatestBlock();
    var nextIndex = prevBlock.index + 1;
    var nextTimestamp = Math.round(new Date().getTime() / 1000);
    var blockTransaction = addTransaction(new_transaction_data, nextIndex);
    var newBlockHash = calculateHashOfData(nextIndex, prevBlock.hash, nextTimestamp, blockTransaction);

    return new Block(nextIndex, prevBlock.hash, nextTimestamp, blockTransaction, newBlockHash);
};

function addTransaction(transaction_data, blockIndex) {
    var nextTimestamp = Math.round(new Date().getTime() / 1000);
    var trHash = calculateHashOfTransactionData(nextTimestamp, transaction_data, DEFAULT_TRANSACTION_TYPE, blockIndex);
    return new Transaction(nextTimestamp, trHash, transaction_data, blockIndex);
}


var calculateHashForBlock = (block) => {
    return calculateHashOfData(block.index, block.previousHash, block.timestamp, block.transaction);
};

function calculateHashOfData (index, prevHash, timestamp, transaction) {
    return CryptoJS.SHA256(index + prevHash + timestamp + transaction).toString();
};

function calculateHashOfTransactionData(received_time, transaction_data, type, blockIndex) {
    return CryptoJS.SHA256(received_time+transaction_data+type+blockIndex).toString();
}

function addBlockToChain(transaction_data) {
    var newBlockForChain = generateNextBlock(transaction_data);
    if (isBlockValid(newBlockForChain, getLatestBlock())) {
        blockchain.push(newBlockForChain);
        return true;
    }
    else return false;
};

function isBlockValid (currentBlock, previousBlock) {
    if (previousBlock.index + 1 !== currentBlock.index) {
        console.log('error: invalid index');
        return false;
    } else if (previousBlock.hash !== currentBlock.previousHash) {
        console.log('error: invalid prevHash');
        return false;
    } else if (calculateHashForBlock(currentBlock) !== currentBlock.hash) {
        console.log(typeof (currentBlock.hash) + ' ' + typeof calculateHashForBlock(currentBlock));
        console.log('error: invalid hash: ' + calculateHashForBlock(currentBlock) + ' ' + currentBlock.hash);
        return false;
    }
    return true;
};

function getLatestBlock() {
    return blockchain[blockchain.length-1];
};

function initBlockchain() {
    readBlockchainFromFile();
}

initHttpServer();

function tryAddNewBlockToBlockchain(transaction_data_) {
    //tr_data_ is JSON object with keys: amount | message

    if (addBlockToChain(transaction_data_)) {
        //in case new block is valid we can go forward
        writeBlockchainToFile(JSON.stringify(blockchain));//callback of method updates [blockchain] variable
        return true;
    }
    return false;
}

/*function validateAllBlocksInChain() {
    var res = true;
    console.log( JSON.stringify( blockchain[0] ));
    if (blockchain.length == 1) {return true;}
    for (var i=1; i<blockchain.length; i++) {//we starts from index 1 in order to satisfy condition [current | previous]
        console.log( JSON.stringify( blockchain[i] ));
        res = isBlockValid(blockchain[i], blockchain[i-1] );//compare curr with prev
        if (!res) 
            break;
    }
    return res;
};*/

function getTotalCoinsGenrated() {
    var res = 0;

    for (var i=0; i<blockchain.length; i++) {

        res += parseInt (blockchain[i]['transaction']['transaction_data']['amount']);//transaction amount
    }
    return res;
};

function getTransactionList() {
    var result = [];
    for (var i=0; i<blockchain.length; i++) {
        result.push(blockchain[i]['transaction']);
    }
    return result;
}

function writeBlockchainToFile(blockchain_data) {
    var file_path = "/var/www/blockchain2/blockchain_database.txt";
    fs.writeFile(file_path, blockchain_data, "utf8", function(err) {
        if(err) {
            // return console.log(err);
        }
        else {
            console.log("blockchain file was saved!");
            initBlockchain();//read updated blockchain after new updated were written to database

        }
    });

};


function readBlockchainFromFile() {
    var file_path = "/var/www/blockchain2/blockchain_database.txt";
    var file_data;

    fs.readFile(file_path, "utf8", function (err, data) {
        if (err) {
          // return console.log(err);
        }
        else {
            if (isJsonStringValid(data)) {
                console.log("blockchain file was read successfully1");
                // console.log(data);
                raw_blockchain_data = data;
                file_data = JSON.parse(data);
                io.emit('raw_blockchain_data', raw_blockchain_data);

                blockchain = null;
                blockchain = deserialize(file_data);

                coinGenerated = getTotalCoinsGenrated();
                io.emit('total_coins', coinGenerated);

            }
            else {
                 console.log("can not read blockchain file1");
            }

             
        }
    });

};

function deserialize(data) {
    var result = [];
    for (var j=0; j<data.length; j++) {

        var blockIndex = data[j]['index'];
        var prevHash = data[j]['previousHash'];
        var timestamp = data[j]['timestamp'];
        var blockTransaction = data[j]['transaction'];
        var blockHash = data[j]['hash'];
        var blockInChain = new Block(blockIndex, prevHash, timestamp, blockTransaction, blockHash);
        result.push(blockInChain);
    }

    return result;

};

function isJsonStringValid(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
};



