import {publicSandboxVisaNumber} from './visa.mjs';

// Visa's public sandbox fixture. This is test data, never a user credential.
// The browser sends the alias only; these fields leave this service via HTTPS.
export function resolveDemoCard(selection){
 if(!selection||selection.testCard!=='visa-1111')throw new Error('Choose the Visa test card.');
 if(['card','billTo','cardToken','number','securityCode','expirationMonth','expirationYear'].some(field=>Object.hasOwn(selection,field)))throw new Error('Send only the test-card selection. Card details are not accepted.');
 return {
  card:{number:publicSandboxVisaNumber,expirationMonth:'12',expirationYear:'2031',securityCode:'123'},
  billTo:{firstName:'Test',lastName:'Shopper',email:'test@example.com',address1:'1 Market St',locality:'San Francisco',administrativeArea:'CA',postalCode:'94105',country:'US'}
 };
}
