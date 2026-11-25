import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('Generated VAPID keys. Put these in server/.env (keep the private key secret):\n');
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
