var reply = require('./../');

reply.confirm('Are you sure you want to do this?', function(err, yes){

  if (!err && yes)
    console.log("Thanks for confirming!");
  else
    console.log("Thanks for not confirming");

});
