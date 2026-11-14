const test=require('node:test');
const assert=require('node:assert/strict');
const {appUrl,trustedFrame}=require('./policy.cjs');
test('Desktop accepts HTTPS origins and permits loopback HTTP only in development',()=>{
  assert.equal(appUrl('https://h3x.example/'),'https://h3x.example');
  assert.equal(appUrl('http://127.0.0.1:5173/',{development:true}),'http://127.0.0.1:5173');
  for(const url of ['http://h3x.example/','http://localhost/','file:///app','https://name:password@h3x.example/','https://h3x.example/other','https://h3x.example/?key=secret','https://h3x.example/#foo'])assert.throws(()=>appUrl(url));
  assert.throws(()=>appUrl('http://external.example/',{development:true}));
});
test('Only the trusted main frame can invoke local tools and shell updates',()=>{
  const frame={url:'https://h3x.example/'},contents={mainFrame:frame},window={isDestroyed:()=>false,webContents:contents};
  const event={sender:contents,senderFrame:frame};
  assert.equal(trustedFrame(event,window,'https://h3x.example'),true);
  assert.equal(trustedFrame({...event,sender:{}},window,'https://h3x.example'),false);
  assert.equal(trustedFrame({...event,senderFrame:{url:frame.url}},window,'https://h3x.example'),false);
  frame.url='https://other.example/';assert.equal(trustedFrame(event,window,'https://h3x.example'),false);
  assert.equal(trustedFrame(event,null,'https://h3x.example'),false);
});
