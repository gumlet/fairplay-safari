async function loadCertificate()
{
    try {
        let response = await fetch(window.certificate_url);
        window.certificate = await response.arrayBuffer();
    } catch(e) {
        window.console.error(`Could not load certificate at ${serverCertificatePath}`);
    }
}

async function startVideo()
{
  await loadCertificate();
  let video = document.querySelector('video');
  video.addEventListener('encrypted', onEncrypted);
  
  // ADAPT: Please put actual HLS stream URL below
  video.src = window.playback_url;
}

async function onEncrypted(event) {
    try {
      let initDataType = event.initDataType;
      if (initDataType !== 'skd') {
        window.console.error(`Received unexpected initialization data type "${initDataType}"`);
        return;
      }
      
      let video = event.target;
      if (!video.mediaKeys) {
        let access = await navigator.requestMediaKeySystemAccess("com.apple.fps", [{
          initDataTypes: [initDataType],
          videoCapabilities: [{ contentType: 'application/vnd.apple.mpegurl', robustness: '' }],
          distinctiveIdentifier: 'not-allowed',
          persistentState: 'not-allowed',
          sessionTypes: ['temporary'],
        }]);
  
        let keys = await access.createMediaKeys();
        
        // Heads Up! The certificate we fetched earlier is used here.
        await keys.setServerCertificate(window.certificate);
        await video.setMediaKeys(keys);
      }
  
      let initData = event.initData;
      let keyURI = uInt8ArrayToString(new Uint8Array(initData));
      
      let session = video.mediaKeys.createSession();
      session.generateRequest(initDataType, initData);
          let message = await new Promise(resolve => {
          session.addEventListener('message', resolve, { once: true });
      });
      
      // licence_url we set earlier is used here.
      let response = await getResponse(message, window.licence_url);
      await session.update(response);
      return session;
    } catch(e) {
      window.console.error(`Could not start encrypted playback due to exception "${e}"`)
    }
  }

  async function getResponse(event, licence_server_url) {
    // need to convert the message to Base64 string
    let spc_string = btoa(String.fromCharCode.apply(null, new Uint8Array(event.message)));
    let licenseResponse = await fetch(licence_server_url, {
        method: 'POST',
        headers: new Headers({'Content-type': 'application/json'}),
        body: JSON.stringify({
            "spc" : spc_string
        }),
    });
    let responseObject = await licenseResponse.json();
    return Uint8Array.from(atob(responseObject.ckc), c => c.charCodeAt(0));
}