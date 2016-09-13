var chai = require('chai');

// config chai
chai.config.includeStack = true;
global.expect = chai.expect;
global.AssertionError = chai.AssertionError;
global.Assertion = chai.Assertion;
global.assert = chai.assert;

resetEnvironment();

function resetEnvironment() {
	// set env variables
	process.env.RABBITMQ_HOST = 'localhost';
	process.env.RABBITMQ_MAX_RESEND_ATTEMPS = 2;
	process.env.FAILED_JOBS_QUEUE_NAME = 'FailedJobsQueue';
}
module.exports.resetEnvironment = resetEnvironment;
