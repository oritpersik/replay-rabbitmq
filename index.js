var amqp = require('amqplib');

var connection, channel;
var MAX_RESEND_ATTEMPTS = process.env.RABBITMQ_MAX_RESEND_ATTEMPTS || 3;
var FAILED_JOBS_QUEUE = process.env.FAILED_JOBS_QUEUE_NAME || 'FailedJobsQueue';

var events = require('events');
var eventEmitter = new events.EventEmitter();
module.exports.eventEmitter = eventEmitter;

module.exports.connect = function (rabbitHost) {
  var rabbitUri = 'amqp://' + rabbitHost;

  // connect rabbitmq, then connect/create channel.
  return amqp.connect(rabbitUri)
    .then(createChannel);
};

// connecting to channel, attaching to appropriate queue and perform
// user callback upon incoming messages.
// maxUnackedMessagesAmount is the maximum number of messages sent over the consumer that can be awaiting ack
// callback should accept 3 parameters: params (the message itself), error, done.
// error should be called whenever we want to signal that we've failed and we want to re-try process the message later
// done should be called whenever we want to signal that we've finished and the message should be erased from queue
module.exports.consume = function (queueName, maxUnackedMessagesAmount, callback) {
  // create queue if not exists
  return assertQueue(queueName)
    .then(function (ok) {
      console.log('Attached to queue:', queueName);

      // define maximum num of messages to be processed without receiving ack
      // false flag means to apply this to every new consumer
      channel.prefetch(maxUnackedMessagesAmount, false);

      return channel.consume(queueName, function (msg) {
        // null msg is sent by RabbitMQ when consumer is cancelled (e.g. queue deleted)
        if (msg === null) {
          return;
        }

        // convert to object
        var messageContent = JSON.parse(msg.content.toString());

        console.log('Received message from queue %s: %s', queueName, JSON.stringify(messageContent));

        // check how many times the message has failed
        var currentTransmissionNum = 0;
        if (msg.properties.headers['x-death']) {
          currentTransmissionNum = msg.properties.headers['x-death'][0].count;
        }

        // if message passed maximum of re-send attempts, pass it to failed jobs queue
       /* if (currentTransmissionNum > MAX_RESEND_ATTEMPTS) {
          console.log('Message exceeded resend attempts amount, passing to failed jobs queue...');
          // produce to failed jobs queue asynchrously then ack message from old queue
          produce(FAILED_JOBS_QUEUE, messageContent)
            .then(function() {
              channel.ack(msg);
              return Promise.resolve();
            });
        } else {
          // else, just send the message.
          // exponential backoff: calculate total sleep time in millis
          var totalSleepMillis = Math.pow(2, currentTransmissionNum) * 1000;
          setTimeout(function () {*/
            // invoke callback and pass an err & done method which acks the message
            callback(messageContent,
              function err() {
                 // negative-acks the message
               // channel.nack(msg, false, false);
              },
              function done() {
                // acks the message
                //channel.ack(msg);
              });
          //}, totalSleepMillis);
       // }
      }, { noAck: true });
    })
    .catch(function (err) {
      console.log('Error in consuming from %s: %s', queueName, err);
      throw err;
    });
};

// produce a message to specific queue.
// this method does not return anything no purpose;
// the client has nothing to do with such failures, the message jus't won't be sent
// and a log will be emitted.
function produce(queueName, message, options) {
  // create queue if not exists
  return assertQueue(queueName)
    .then(function (ok) {
      console.log('Sending message to queue %s: %s', queueName, JSON.stringify(message));
      options = options || {};
      options.persistent = true;
      return channel.sendToQueue(queueName, new Buffer(JSON.stringify(message)), options);
    })
    .catch(function (err) {
      console.log('Error in producing to %s: %s', queueName, err);
      throw err;
    });
}
module.exports.produce = produce;

module.exports.deleteQueue = function (queueName) {
  return channel.deleteQueue(queueName)
    .catch(function (err) {
      console.log('Error in deleting queue %s', queueName);
      throw err;
    });
};

function createChannel(conn) {
  connection = conn;
  return connection.createChannel()
    .then(function (ch) {
      channel = ch;
      channel.on('close', onChannelClose);
      channel.on('error', onChannelError);
      console.log('Connected to RabbitMQ.');
    });
}

// create queue if not exists
function assertQueue(queueName) {
  // durable: persist queue messages
  // deadLetterExchange: use default exchange
  // deadLetterRoutingKey: router dead letter messages back to original queue
  return channel.assertQueue(queueName, { durable: true, deadLetterExchange: '', deadLetterRoutingKey: queueName , maxPriority: 100});
}

// A channel will emit 'close' once the closing handshake (possibly initiated by calling close()) has completed;
// or, if its connection closes.
function onChannelClose() {
  console.log('Channel has closed.');
  eventEmitter.emit('channel.close');
}

// A channel will emit 'error' if the server closes the channel for any reason.
// Such reasons include:
//  * an operation failed due to a failed precondition (usually something named in an argument not existing)
//  * an human closed the channel with an admin tool
// A channel will not emit 'error' if its connection closes with an error.
function onChannelError(err) {
  console.log('Channel has errored.', err);
  eventEmitter.emit('channel.error');
}
