var rl, readline = require('readline');

/**
 * Creates or resumes the readline interface.
 *
 * @param {readline} stdin - readline stdin stream
 * @param {readline} stdout - readline stdout stream
 * @returns {stream} rl - the readline interface
 */
var get_interface = function(stdin, stdout) {
  if (!rl) rl = readline.createInterface(stdin, stdout);
  else stdin.resume(); // interface exists
  return rl;
}

/**
 * Ask a question and prompt for confirmation
 *
 * @param {string} message - the message
 * @param {error} callback - an error callback
 * @exports confirm
 */
var confirm = exports.confirm = function(message, callback) {

  var question = {
    'reply': {
      type: 'confirm',
      message: message,
      default: 'yes'
    }
  }

  get(question, function(err, answer) {
    if (err) return callback(err);
    callback(null, answer.reply === true || answer.reply == 'yes');
  });

};

/**
 * Main get function for the readline wrappers
 *
 * @param {array} options - list of options the user is expected to give a valid answer from
 * @param {error} callback - error callback
 */
var get = exports.get = function(options, callback) {

  if (!callback) return; // no point in continuing

  if (typeof options != 'object') // requires options object
    return callback(new Error("Please pass a valid options object."))

  var answers = {},
      stdin = process.stdin,
      stdout = process.stdout,
      fields = Object.keys(options);

  /**
   * quite the prompt
   */
  var done = function() {
    close_prompt();
    callback(null, answers);
  }

  /**
   * Close the prompt
   */
  var close_prompt = function() {
    stdin.pause();
    if (!rl) return;
    rl.close();
    rl = null;
  }

  /**
   * Get the default answers types
   * 
   * @param {string} key - the key linked to the pertaining option
   * @param {string} partial_answers - the default built in answers
   * @return {object} option - the option object
   */
  var get_default = function(key, partial_answers) {
    if (typeof options[key] == 'object')
      return typeof options[key].default == 'function' ? options[key].default(partial_answers) : options[key].default;
    else
      return options[key];
  }

  /**
   * Guesses if the reply is "yes"ish or "no"ish
   *
   * @param {string} reply - the reply coming in
   * @returns {boolean} reply - if the reply is yes or no
   */
  var guess_type = function(reply) {

    if (reply.trim() == '')
      return;
    else if (reply.match(/^(true|y(es)?)$/)) // mostly "yes"
      return true;
    else if (reply.match(/^(false|n(o)?)$/)) // mostly "no"
      return false;
    else if ((reply*1).toString() === reply)
      return reply*1;

    return reply;
  }

  /**
   * Determine the type of reply
   *
   * @param {string} key - the key for the speific option
   * @param {string} answer - the reply from the user
   * @returns {boolean} if the answer is a valid reply
   */
  var validate = function(key, answer) {

    if (typeof answer == 'undefined')
      return options[key].allow_empty || typeof get_default(key) != 'undefined';
    else if(regex = options[key].regex)
      return regex.test(answer);
    else if(options[key].options) // is the answer in the options
      return options[key].options.indexOf(answer) != -1;
    else if(options[key].type == 'confirm')
      return typeof(answer) == 'boolean'; // answer was given so it should be
    else if(options[key].type && options[key].type != 'password')
      return typeof(answer) == options[key].type;

    return true;

  }

  /**
   * Prints out the errors
   * 
   * @param {string} key - the key for the speific option
   */
  var show_error = function(key) {
    var str = options[key].error ? options[key].error : 'Invalid value.';

    if (options[key].options)
        str += ' (options are ' + options[key].options.join(', ') + ')';

    stdout.write("\033[31m" + str + "\033[0m" + "\n"); // JSDoc does not allow octal literals
  }

  var show_message = function(key) {
    var msg = '';

    if (text = options[key].message)
      msg += text.trim() + ' ';

    if (options[key].options)
      msg += '(options are ' + options[key].options.join(', ') + ')';

    if (msg != '') stdout.write("\033[1m" + msg + "\033[0m\n"); // JSDoc does not allow octal literals
  }

  // taken from commander lib
  var wait_for_password = function(prompt, callback) {

    var buf = '',
        mask = '*';

    var keypress_callback = function(c, key) {

      if (key && (key.name == 'enter' || key.name == 'return')) {
        stdout.write("\n");
        stdin.removeAllListeners('keypress');
        // stdin.setRawMode(false);
        return callback(buf);
      }

      if (key && key.ctrl && key.name == 'c')
        close_prompt();

      if (key && key.name == 'backspace') {
        buf = buf.substr(0, buf.length-1);
        var masked = '';
        for (i = 0; i < buf.length; i++) { masked += mask; }
        stdout.write('\r\033[2K' + prompt + masked); // JSDoc does not allow octal literals
      } else {
        stdout.write(mask);
        buf += c;
      }

    };

    stdin.on('keypress', keypress_callback);
  }
  
  /**
   * Checks if the reply is a valid type of answer
   *
   * @param {integer} index - the current indext
   * @param {string} curr_key - the current key for the option being compared to
   * @param {string} reply - the user's reply
   */
  var check_reply = function(index, curr_key, fallback, reply) {
    var answer = guess_type(reply);
    var return_answer = (typeof answer != 'undefined') ? answer : fallback;

    if (validate(curr_key, answer))
      next_question(++index, curr_key, return_answer); // check next question to see if that is a valid reply
    else
      show_error(curr_key) || next_question(index); // repeats current
  }

  /**
   * Checks if the reply is a valid type of answer
   *
   * @param {array} conds - the condtions that need to be met
   * @returns {boolean} if the dependancies have been met or not
   */
  var dependencies_met = function(conds) {
    for (var key in conds) {
      var cond = conds[key];
      if (cond.not) { // object, inverse
        if (answers[key] === cond.not)
          return false;
      } else if (cond.in) { // array 
        if (cond.in.indexOf(answers[key]) == -1) // condition not in the list of answers
          return false;
      } else {
        if (answers[key] !== cond) // the answer does not equal the condition
          return false; 
      }
    }

    return true;
  }
  
  /**
   * Prompts the user/setups up the next question
   *
   * @param {integer} index - the current indext
   * @param {string} prev_key - the previous key for the option being compared to
   * @param {string} answer - the user's answer/reply
   */
  var next_question = function(index, prev_key, answer) {
    if (prev_key) answers[prev_key] = answer;

    var curr_key = fields[index];
    if (!curr_key) return done();

    if (options[curr_key].depends_on) { // ensure the dependencies have been met
      if (!dependencies_met(options[curr_key].depends_on))
        return next_question(++index, curr_key, undefined);
    }

    var prompt = (options[curr_key].type == 'confirm') ? // prompt the user 
      ' - yes/no: ' : " - " + curr_key + ": ";

    var fallback = get_default(curr_key, answers);
    if (typeof(fallback) != 'undefined' && fallback !== '')
      prompt += "[" + fallback + "] ";

    show_message(curr_key);

    // for password security
    if (options[curr_key].type == 'password') {

      var listener = stdin._events.keypress; // to reassign down later
      stdin.removeAllListeners('keypress');

      // stdin.setRawMode(true);
      stdout.write(prompt);

      wait_for_password(prompt, function(reply) {
        stdin._events.keypress = listener; // reassign
        check_reply(index, curr_key, fallback, reply)
      });

    } else {

      rl.question(prompt, function(reply) {
        check_reply(index, curr_key, fallback, reply);
      });

    }

  }

  rl = get_interface(stdin, stdout);
  next_question(0);
  
  // close the stream
  rl.on('close', function() {
    close_prompt(); // just in case

    var given_answers = Object.keys(answers).length;
    if (fields.length == given_answers) return;

    var err = new Error("Cancelled after giving " + given_answers + " answers.");
    callback(err, answers);
  });

}
