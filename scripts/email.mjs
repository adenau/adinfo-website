export function decodeEmails($) {
  $('[data-cfemail]').each((i, el) => {
    const encoded = $(el).attr('data-cfemail');
    const key = parseInt(encoded.slice(0, 2), 16);
    const email = encoded.slice(2).match(/../g).map(byte => String.fromCharCode(parseInt(byte, 16) ^ key)).join('');
    $(el).text(email).removeAttr('data-cfemail').removeClass('__cf_email__');
    $(el).closest('a').attr('href', `mailto:${email}`);
  });
}
