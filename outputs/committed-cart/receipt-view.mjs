export function publicVisaReceipt(cart) {
 const r=cart.visaReceipt;
 if(!r)return null;
 return {status:r.status,checkedAt:r.checkedAt,source:'Visa Acceptance Transaction Details API',scope:'Historical sandbox authorization record; not current funds availability or purchase completion'};
}
