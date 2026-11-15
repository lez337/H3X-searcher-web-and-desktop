'use strict';
// Extract contacts from any category, excluding dates, IPs and identifier fields.
function contactValues(value,key=''){
 if(/(?:password|passwd|secret|token|cookie|session|authorization|api.?key)|(?:^|[_.])(?:id|date|dob|birth|postal|zip|tax)(?:$|[_.])/i.test(key))return {emails:[],phones:[]};
 const text=String(value??''),emails=text.match(/[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/g)||[];
 const phones=(text.replace(/[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/g,'').match(/(?<![\w])\+?\d(?:[\d ().-]*\d)?(?![\w])/g)||[]).filter(v=>{
  const digits=v.replace(/\D/g,'');return digits.length>=7&&digits.length<=15&&!/^(\d)\1+$/.test(digits)&&!/^\d{1,4}[-.]\d{1,2}[-.]\d{1,4}$/.test(v)&&!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v);
 });
 return {emails,phones};
}
module.exports={contactValues};
