var util = require('util');
var config = require('./config'),
	rabbit = require('../index');

var testQueueName = 'TestQueue';

describe('replay-rabbitmq tests', function () {
	before(function () {
		config.resetEnvironment();
		return rabbit.connect(process.env.RABBITMQ_HOST)
			.then(() => rabbit.deleteQueue(testQueueName));
	});

	after(function () {
		return rabbit.connect(process.env.RABBITMQ_HOST)
			.then(() => rabbit.deleteQueue(testQueueName));
	});

	describe('sanity tests', function () {
		beforeEach(function () {
			config.resetEnvironment();
			return rabbit.connect(process.env.RABBITMQ_HOST)
				.then(() => rabbit.deleteQueue(testQueueName));
		});

		it('should produce message', function (done) {
			var message = {
				title: 'test'
			};

			rabbit
				.produce(testQueueName, message)
				.then(() => done())
				.catch(function (err) {
					if (err) {
						return done(err);
					}
					done(new Error('Test errored without error object.'));
				});
		});

		it('should consume message', function (done) {
			var message = {
				title: 'test'
			};

			rabbit
				.produce(testQueueName, message)
				.then(function () {
					return rabbit.consume(testQueueName, 1, function (params, _error, _done) {
						expect(params).to.deep.equal(message);
						_done();
						done();
					});
				})
				.catch(function (err) {
					if (err) {
						return done(err);
					}
					done(new Error('Test errored without error object.'));
				});
		});

		it(util.format('should retry consuming message %s times', process.env.RABBITMQ_MAX_RESEND_ATTEMPS), function (done) {
			var maxRetrySleepMillis = calcSleepInMillis();
			this.timeout(maxRetrySleepMillis);

			var consumptionCounter = 0;
			var message = {
				title: 'test'
			};

			rabbit
				.produce(testQueueName, message)
				.then(function () {
					return rabbit.consume(testQueueName, 1, function (params, _error, _done) {
						++consumptionCounter;
						if (consumptionCounter > process.env.RABBITMQ_MAX_RESEND_ATTEMPS) {
							_done();
							return done();
						}
						_error();
					});
				})
				.catch(function (err) {
					if (err) {
						return done(err);
					}
					done(new Error('Test errored without error object.'));
				});
		});

		it('should produce message to failed jobs queue', function (done) {
			var maxRetrySleepMillis = calcSleepInMillis();
			this.timeout(maxRetrySleepMillis);

			var consumptionCounter = 0;
			var message = {
				title: 'test'
			};

			rabbit
				.produce(testQueueName, message)
				.then(function () {
					return rabbit.consume(testQueueName, 1, function (_params, _error, _done) {
						++consumptionCounter;
						_error();
						if (consumptionCounter > process.env.RABBITMQ_MAX_RESEND_ATTEMPS) {
							rabbit.consume(process.env.FAILED_JOBS_QUEUE_NAME, 1, function (__params, __error, __done) {
								expect(__params).to.deep.equal(message);
								__done();
								return done();
							});
						}
					});
				})
				.catch(function (err) {
					if (err) {
						return done(err);
					}
					done(new Error('Test errored without error object.'));
				});
		});
	});

	describe('bad input tests', function () {
		it('#connect host invalid', function (done) {
			rabbit
				.connect('someNotExistedHost')
				.then(() => done(new Error('Connected with invalid rabbitmq host.')))
				.catch(() => done());
		});

		it('#consume negative maxUnackedMessagesAmount', function (done) {
			rabbit
				.consume(testQueueName, -1, function (params, error, done) { })
				.catch(() => done());
		});
	});
});

function calcSleepInMillis() {
	var maxRetrySleepMillis = 0;
	// sum up the total time we're going to sleep due to re-send attempts
	for (var i = 0; i <= process.env.RABBITMQ_MAX_RESEND_ATTEMPS; i++) {
		maxRetrySleepMillis += Math.pow(2, i) * 1000;
	}
	// add some safety gap
	maxRetrySleepMillis += 3 * 1000;

	return maxRetrySleepMillis;
}
