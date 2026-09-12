use sendmux::sending::{Address, Attachment, EmailSendRequest};
use sendmux::{MailboxClient, ManagementClient, SendingClient};

fn main() {
    let mut request = EmailSendRequest::new(
        Address::new("sender@example.test"),
        Address::new("recipient@example.test"),
        "Fixture",
        "<p>Fixture</p>",
    );
    request.attachments.push(Attachment::base64("note.txt", "SGk="));
    request.attachments.push(Attachment::uploaded("att_abcdefghijklmnopqrstuvwx"));
    assert_eq!(request.attachments.len(), 2);
    assert!(SendingClient::new("smx_mbx_fixture").is_ok());
    assert!(MailboxClient::new("smx_mbx_fixture").is_ok());
    assert!(ManagementClient::new("smx_root_fixture").is_ok());
}

#[test]
fn installed_public_types_and_constructors_work_on_the_floor() {
    main();
}
