'use strict';
const {oathSession}=require('./oath-session.cjs');
async function loadRedactedTree(logId,key){
  if(typeof logId!=='string'||!logId.trim()||logId.length>512)throw Error('No stealer log is available for this record.');
  if(!key)throw Error('Add your OathNet API key in Settings.');
  const searchId=await oathSession(logId,key);
  const response=await fetch('https://oathnet.org/api/service/v2/victims/'+encodeURIComponent(logId)+'?'+new URLSearchParams({search_id:searchId}),{headers:{'x-api-key':key},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('File tree request failed (HTTP '+response.status+').');
  const data=await response.json();
  const tree=data.victim_tree??data.data?.victim_tree;
  if(!tree)throw Error('The provider did not return a file tree.');
  return {tree};
}
module.exports={loadRedactedTree};
