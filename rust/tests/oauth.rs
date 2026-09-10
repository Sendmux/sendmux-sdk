use sendmux::{Error, MailboxClient, ManagementClient, SendingClient};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

const CONNECTION: &str = r#"{"ok":true,"data":{"team":{"id":"team_test","name":"Fixture team"},"credential":{"id":"grant_test","type":"oauth","name":null},"label":"Fixture team","permissions":[],"mailboxes":[]},"meta":{"request_id":"req_test"}}"#;

struct HttpFixture {
    url: String,
    requests: Arc<Mutex<Vec<String>>>,
    stopped: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl HttpFixture {
    fn new() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}/api/v1", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let captured = requests.clone();
        let stopped = Arc::new(AtomicBool::new(false));
        let stop = stopped.clone();
        let worker = thread::spawn(move || {
            while !stop.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        stream.set_nonblocking(false).unwrap();
                        stream
                            .set_read_timeout(Some(Duration::from_secs(5)))
                            .unwrap();
                        let mut request = Vec::new();
                        while !request.ends_with(b"\r\n\r\n") {
                            let mut byte = [0];
                            stream.read_exact(&mut byte).unwrap();
                            request.push(byte[0]);
                        }
                        captured
                            .lock()
                            .unwrap()
                            .push(String::from_utf8(request).unwrap());
                        write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", CONNECTION.len(), CONNECTION).unwrap();
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(2));
                    }
                    Err(error) => panic!("HTTP fixture accept failed: {error}"),
                }
            }
        });
        Self {
            url,
            requests,
            stopped,
            worker: Some(worker),
        }
    }

    fn authorizations(&self) -> Vec<String> {
        self.requests
            .lock()
            .unwrap()
            .iter()
            .map(|request| {
                request
                    .lines()
                    .find(|line| line.to_lowercase().starts_with("authorization:"))
                    .unwrap()
                    .split_once(':')
                    .unwrap()
                    .1
                    .trim()
                    .to_owned()
            })
            .collect()
    }
}

impl Drop for HttpFixture {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::SeqCst);
        self.worker.take().unwrap().join().unwrap();
    }
}

macro_rules! oauth_tests {
    ($module:ident, $client:ty) => {
        mod $module {
            use super::*;

            #[tokio::test]
            async fn static_access_token() {
                let server = HttpFixture::new();
                let client = <$client>::new_with_access_token("opaque/token+value==")
                    .unwrap()
                    .with_base_url(&server.url)
                    .unwrap();
                let response = client.get_connection().await.unwrap();
                assert_eq!(
                    response.data.credential.credential_type,
                    sendmux::CredentialType::Oauth
                );
                assert_eq!(server.authorizations(), ["Bearer opaque/token+value=="]);
            }

            #[tokio::test]
            async fn provider_refreshes_lazily_and_survives_clone() {
                let server = HttpFixture::new();
                let calls = Arc::new(AtomicUsize::new(0));
                let counter = calls.clone();
                let client = <$client>::new_with_token_provider(move || {
                    let counter = counter.clone();
                    async move {
                        tokio::task::yield_now().await;
                        Ok(format!("token-{}", counter.fetch_add(1, Ordering::SeqCst)))
                    }
                })
                .unwrap()
                .with_base_url(&server.url)
                .unwrap();
                assert_eq!(calls.load(Ordering::SeqCst), 0);
                client.get_connection().await.unwrap();
                client.clone().get_connection().await.unwrap();
                assert_eq!(
                    server.authorizations(),
                    ["Bearer token-0", "Bearer token-1"]
                );
            }

            #[tokio::test]
            async fn provider_error_and_malformed_token_never_reach_http() {
                let server = HttpFixture::new();
                let client =
                    <$client>::new_with_token_provider(|| async { Err(Error::MissingApiKey) })
                        .unwrap()
                        .with_base_url(&server.url)
                        .unwrap();
                assert!(matches!(
                    client.get_connection().await,
                    Err(Error::MissingApiKey)
                ));
                for token in ["", "Bearer token", "bad\n", "bad token", "=bad", "ümlaut"] {
                    let client =
                        <$client>::new_with_token_provider(
                            move || async move { Ok(token.to_owned()) },
                        )
                        .unwrap()
                        .with_base_url(&server.url)
                        .unwrap();
                    let error = client.get_connection().await.unwrap_err();
                    assert!(error.to_string().contains("access token"));
                }
                assert!(server.requests.lock().unwrap().is_empty());
            }

            #[test]
            fn malformed_static_access_token_is_rejected() {
                for token in ["", "Bearer token", "bad\n", "bad token", "=bad", "ümlaut"] {
                    let error = <$client>::new_with_access_token(token).err().unwrap();
                    assert!(error.to_string().contains("access token"));
                }
            }
        }
    };
}

oauth_tests!(sending, SendingClient);
oauth_tests!(mailbox, MailboxClient);
oauth_tests!(management, ManagementClient);
