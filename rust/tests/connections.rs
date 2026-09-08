use sendmux::{MailboxClient, ManagementClient, SendingClient};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread::{self, JoinHandle};
use std::time::Duration;

fn connection_server() -> (String, JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base_url = format!("http://{}/api/v1", listener.local_addr().unwrap());
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut request = Vec::new();
        while !request.ends_with(b"\r\n\r\n") {
            let mut byte = [0];
            stream.read_exact(&mut byte).unwrap();
            request.push(byte[0]);
        }
        let body = r#"{"ok":true,"data":{"team":{"id":"team_test","name":"Fixture team"},"credential":{"id":"key_test","type":"api_key","name":null},"label":"Fixture team","permissions":[],"mailboxes":[]},"meta":{"request_id":"req_test"}}"#;
        write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
        String::from_utf8(request).unwrap()
    });
    (base_url, handle)
}

#[tokio::test]
async fn management_connection_returns_typed_metadata() {
    let (base_url, server) = connection_server();
    let client = ManagementClient::new("smx_root_test")
        .unwrap()
        .with_base_url(base_url)
        .unwrap();
    let response = client.get_connection().await.unwrap();
    assert_eq!(response.data.team.id, "team_test");
    assert_eq!(response.data.credential.name, None);
    let request = server.join().unwrap().to_lowercase();
    assert!(request.starts_with("get /api/v1/me http/1.1\r\n"));
    assert!(request.contains("authorization: bearer smx_root_test\r\n"));
}

#[tokio::test]
async fn mailbox_connection_needs_no_target() {
    let (base_url, server) = connection_server();
    let client = MailboxClient::new("smx_mbx_test")
        .unwrap()
        .with_base_url(base_url)
        .unwrap();
    let response = client.get_connection().await.unwrap();
    assert!(response.data.mailboxes.is_empty());
    assert_eq!(response.data.label, "Fixture team");
    let request = server.join().unwrap().to_lowercase();
    assert!(request.starts_with("get /api/v1/mailbox/connection http/1.1\r\n"));
    assert!(request.contains("authorization: bearer smx_mbx_test\r\n"));
}

#[tokio::test]
async fn sending_connection_needs_no_email_payload() {
    let (base_url, server) = connection_server();
    let client = SendingClient::new("smx_mbx_test")
        .unwrap()
        .with_base_url(base_url)
        .unwrap();
    let response = client.get_connection().await.unwrap();
    assert!(response.data.permissions.is_empty());
    assert_eq!(response.request_id(), "req_test");
    let request = server.join().unwrap().to_lowercase();
    assert!(request.starts_with("get /api/v1/me http/1.1\r\n"));
    assert!(request.contains("authorization: bearer smx_mbx_test\r\n"));
}
