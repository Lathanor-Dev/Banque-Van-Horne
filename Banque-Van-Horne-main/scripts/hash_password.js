const bcrypt = require('bcryptjs');
const password = process.argv[2];
if(!password){
  console.error('Usage: node scripts/hash_password.js "VotreMotDePasseFort"');
  process.exit(1);
}
bcrypt.hash(password, 12).then(hash=>{
  console.log(hash);
});
