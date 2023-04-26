import { useEffect, useRef } from "react";
import { ArrayGenerated, Builder, PromiseSnapshotElement, ValueListenerElement } from "./my_util_components";

export default function App() {
    useEffect(() => {
        mountedRef.current = true;
        remoteExplorerWebsocketConnectLoop();
        return () => {
            mountedRef.current = false;
            if (remoteExplorerWebsocketRef.current != null) {
                remoteExplorerWebsocketRef.current.close(); //kills connection attempt too and doesn't throw if connection is closed already
            }
        }
    });

    const remoteExplorerEventBroadcastsManagerRef=useRef(new BroadcastsManager());


    const mountedRef = useRef(false);
    const remoteExplorerWebsocketRef = useRef(null);

    const remoteExplorerWebsocketReadyStateNotifierRef = useRef(new ValueListenerElement.ValueNotifier(WebSocket.CLOSED));
    const uploadableFilesNotifierRef = useRef(new ValueListenerElement.ValueNotifier({}));
    const uploadingTaskInstanceNotifierRef = useRef(new ValueListenerElement.ValueNotifier(null));


    const remoteExplorerWebsocketConnectLoop = function () {

        const doDelayedReconnect = function () {
            setTimeout(function () {
                if (mountedRef.current) {
                    remoteExplorerWebsocketConnectLoop();
                }
            }, 4000);
        };

        remoteExplorerWebsocketRef.current = new WebSocket(`${window.location.protocol==="https:"? "wss":"ws"}://${window.location.host}`);
        remoteExplorerWebsocketReadyStateNotifierRef.current.setValue(WebSocket.CONNECTING);
        remoteExplorerWebsocketRef.current.addEventListener("open", function (e) {
            remoteExplorerWebsocketReadyStateNotifierRef.current.setValue(WebSocket.OPEN);
        });
        remoteExplorerWebsocketRef.current.addEventListener("close", function (e) {
            remoteExplorerWebsocketReadyStateNotifierRef.current.setValue(WebSocket.CLOSED);
            doDelayedReconnect();
        });
        remoteExplorerWebsocketRef.current.addEventListener("error", function (e) {
            remoteExplorerWebsocketReadyStateNotifierRef.current.setValue(WebSocket.CLOSED);
            doDelayedReconnect();
        });

        remoteExplorerWebsocketRef.current.addEventListener("message",function(e){
            remoteExplorerEventBroadcastsManagerRef.current.broadcast(e.data);
        });
    }

    const doAddUploadableFiles = function (files) {
        const uploadableFiles = uploadableFilesNotifierRef.current.getValue();

        const conflictingPaths = [];
        for (const file of files) {
            const path = file.webkitRelativePath || file.name;
            if (uploadableFiles[path] !== undefined) {
                conflictingPaths.push(path);
            }
        }

        if (conflictingPaths.length > 0) {
            const doOverwrite = window.confirm(`Confirm Overwrite? File with the following paths conflict with those that were already added before. \n ${conflictingPaths.join(", ")}`);
            if (!doOverwrite) {
                return;
            }
            for (const file of files) {
                const path = file.webkitRelativePath || file.name;
                uploadableFiles[path] = file;
            }
        }
        else {
            for (const file of files) {
                const path = file.webkitRelativePath || file.name;
                uploadableFiles[path] = file;
            }
        }

        uploadableFilesNotifierRef.current.hardUpdate();
    }

    const doUploadFiles = async function () {
        const files = [];
        uploadableFilesNotifierRef.current.hardUpdate(function (value) {
            for (const key of Object.keys(value)) {
                files.push(value[key]);
                delete value[key];
            }
        });

        uploadingTaskInstanceNotifierRef.current.setValue({
            files,
            uploading: null,
            uploadingProgress: null,
        });

        while (true) {
            const uploadingTaskInstance = uploadingTaskInstanceNotifierRef.current.getValue();

            if (uploadingTaskInstance.uploading === null) {
                if (!(uploadingTaskInstance.files.length > 0)) {
                    break;
                }
                uploadingTaskInstance.uploading = 0;
            }
            else {
                uploadingTaskInstance.uploading += 1;
                if (uploadingTaskInstance.uploading >= uploadingTaskInstance.files.length) {
                    break;
                }
            }

            const victimFile = uploadingTaskInstance.files[uploadingTaskInstance.uploading];

            const formData = new FormData();
            formData.append(`file`, victimFile, victimFile.webkitRelativePath || victimFile.name);

            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload', true);

            xhr.upload.onprogress = (event) => {
                uploadingTaskInstanceNotifierRef.current.hardUpdate(function (value) {
                    value.uploadingProgress = event.lengthComputable ? (event.loaded / event.total) * victimFile.size : null;
                });
            };

            xhr.send(formData);

            uploadingTaskInstanceNotifierRef.current.hardUpdate(function (value) {
                value.uploadingProgress = null;
            });

            await new Promise(function (resolve, reject) {
                xhr.onload = () => {
                    resolve();
                };

                xhr.onerror = (e) => {
                    reject(e);
                };
            });

            await new Promise(function (resolve, reject) {
                setTimeout(function () {
                    resolve();
                }, 2000);
            });
        }

        uploadingTaskInstanceNotifierRef.current.setValue(null);
    }

    return (
        <section style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
        }}>
            <section style={{
                width: "100%",
                height: 0,
                flexGrow: 1,
                display: "flex",
            }}>




                {/* Preparation Centre */}
                <section style={{
                    width: "50%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    border: "2px solid black",
                    padding: 10,
                }}>
                    <section>
                        Preparation Centre [Prepare files to send here]
                    </section>
                    <section>
                        <button onClick={(e) => {
                            const inputElement = document.createElement("input");
                            inputElement.type = "file";
                            inputElement.multiple = true;
                            inputElement.click();
                            inputElement.oninput = function () {
                                doAddUploadableFiles(inputElement.files);
                            }
                        }}>add single file(s)</button>
                        <button onClick={(e) => {
                            const inputElement = document.createElement("input");
                            inputElement.type = "file";
                            inputElement.multiple = true;
                            inputElement.webkitdirectory = true;
                            inputElement.directory = true;
                            inputElement.click();
                            inputElement.oninput = function () {
                                doAddUploadableFiles(inputElement.files);
                            }
                        }}>add folder</button>
                    </section>
                    <ValueListenerElement valueNotifier={uploadableFilesNotifierRef.current} renderer={(v) => {
                        const uploadableFilesPaths = Object.keys(v);
                        if (!(uploadableFilesPaths.length > 0)) {
                            return (
                                <section>No files added yet</section>
                            );
                        }
                        return (
                            <section style={{
                                width: "100%",
                                display: "flex",
                            }}>
                                <section style={{
                                    width: 0,
                                    flexGrow: 1,
                                }}>
                                    {`${uploadableFilesPaths.length} files`}
                                </section>
                                <button onClick={(e) => {
                                    uploadableFilesNotifierRef.current.hardUpdate(function (value) {
                                        for (const key of Object.keys(value)) {
                                            delete value[key];
                                        }
                                    });
                                }}>remove all</button>
                                <button onClick={(v => {
                                    doUploadFiles();
                                })}>upload</button>
                            </section>
                        );
                    }} />

                    <section style={{
                        width: "100%",
                        height: 0,
                        flexGrow: 1,
                        overflow: "auto",
                    }}>
                        <ValueListenerElement valueNotifier={uploadableFilesNotifierRef.current} renderer={(v) => {
                            const uploadableFilesPaths = Object.keys(v);
                            return (
                                <ArrayGenerated count={uploadableFilesPaths.length} getIndexComponent={(index) => {
                                    const uploadableFilePath = uploadableFilesPaths[index];
                                    const file = v[uploadableFilePath];
                                    return (
                                        <section style={{
                                            padding: 6,
                                            display: "flex",
                                            width: "100%",
                                        }}>
                                            <section style={{
                                                width: 0,
                                                flexGrow: 1,
                                            }}>
                                                {uploadableFilePath} [{file.size}]
                                            </section>
                                            <button onClick={(e) => {
                                                uploadableFilesNotifierRef.current.hardUpdate(function (value) {
                                                    delete value[uploadableFilePath];
                                                });
                                            }}>X</button>
                                        </section>
                                    );
                                }} />
                            );
                        }} />
                    </section>
                </section>





                {/* Remote Explorer */}
                <section style={{
                    width: "50%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    border: "2px solid black",
                    padding: 10,
                }}>
                    <section>
                        Remote Explorer
                    </section>
                    <ValueListenerElement valueNotifier={remoteExplorerWebsocketReadyStateNotifierRef.current} renderer={(v) => {
                        let connectionStateInfo = null;
                        let connectionStateInfoCssColor = null;
                        if (v === WebSocket.CONNECTING) {
                            connectionStateInfo = "connecting";
                            connectionStateInfoCssColor = "orange";
                        }
                        if (v === WebSocket.OPEN) {
                            connectionStateInfo = "connected [listening for updates]";
                            connectionStateInfoCssColor = "green";
                        }
                        if (v === WebSocket.CLOSING) {
                            connectionStateInfo = "disconnecting";
                            connectionStateInfoCssColor = "red";
                        }
                        if (v === WebSocket.CLOSED) {
                            connectionStateInfo = "not connected [won't receive updates]";
                            connectionStateInfoCssColor = "grey";
                        }
                        return (
                            <section style={{
                                color: connectionStateInfoCssColor,
                                fontSize: 13,
                            }}>
                                {connectionStateInfo}
                            </section>
                        );
                    }} />

                    <section style={{
                        width: "100%",
                        padding: "6px 0",
                        display: "flex",
                        alignItems: "center",
                    }}>
                        <section style={{
                            padding: 4,
                            fontSize: 20,
                        }}>
                            /
                        </section>
                        <input type="text" style={{
                            width: 0,
                            flexGrow: 1,
                            height: 30,
                            padding: 6,
                            fontSize: 16,
                        }} placeholder="input/path/to/navigate" />
                    </section>
                    <section style={{
                        width: "100%",
                        height: 0,
                        flexGrow: 1,
                    }}>
                        <RemoteExplorerFolderView path={""} remoteExplorerEventBroadcastsManager={remoteExplorerEventBroadcastsManagerRef.current}/>
                    </section>
                </section>




            </section>


            <ValueListenerElement valueNotifier={uploadingTaskInstanceNotifierRef.current} renderer={(v) => {
                if (v == null) {
                    return (
                        <section>
                            No on-going upload(s)
                        </section>
                    );
                }
                return (
                    <section style={{
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                    }}>
                        <Builder renderer={function () {
                            if (v.uploading == null) {
                                return "Uploading files ...";
                            }
                            const uploadingFile = v.files[v.uploading];
                            return (
                                <section style={{
                                    width: "100%",
                                    display: "flex",
                                    flexDirection: "column",
                                }}>
                                    <section style={{
                                        width: "100%",
                                    }}>
                                        Uploading file {v.uploading + 1} of {v.files.length}; {v.uploadingProgress != null ? `Progressed ~ ${v.uploadingProgress} of ${uploadingFile.size || "#"}  ${uploadingFile.size ? `[${(v.uploadingProgress / uploadingFile.size) * 100}%]` : ""}` : `Size ${uploadingFile.size}`}
                                    </section>
                                    <section>
                                        {uploadingFile.webkitRelativePath || uploadingFile.name}
                                    </section>
                                </section>
                            );
                        }}></Builder>
                        <Builder renderer={function () {
                            if (v.uploading == null) {
                                return null;
                            }
                            // const uploadingFile=v.files[v.uploading];

                            let totalSize = 0;
                            let uploadedFilesSize = 0;
                            for (let i = 0; i < v.files.length; i++) {
                                const file = v.files[i];
                                totalSize += file.size;
                                if (i < v.uploading) {
                                    uploadedFilesSize += file.size;
                                }
                            }

                            const totalSizeProgress = uploadedFilesSize + v.uploadingProgress || 0;
                            return (
                                <section style={{
                                    padding: 10,
                                    width: "100%",
                                    display: "flex",
                                }}>
                                    <progress value={totalSize > 0 ? totalSizeProgress / totalSize : 1} max={1} style={{
                                        width: "100%",
                                    }}></progress>
                                    <section style={{
                                        padding: 8,
                                    }}>
                                        {totalSize > 0 ? `[${Math.ceil((totalSizeProgress / totalSize) * 100)}%]` : ""}
                                    </section>
                                </section>
                            );
                        }}></Builder>
                    </section>
                );
            }} />
        </section>
    );
}

function RemoteExplorerFolderView({
    path,
    remoteExplorerEventBroadcastsManager,
}) {

    useEffect(function () {
        contentsFetcherNotifierRef.current.setValue(exploreFolder(path));
        remoteExplorerEventBroadcastsManager.addListener(remoteExplorerEventListener);
        return ()=>{
            remoteExplorerEventBroadcastsManager.removeListener(remoteExplorerEventListener);
        };
    });

    const remoteExplorerEventListener=function(eventData){
        const eventDataObj=JSON.parse(eventData);
        //to find out whether the change concerns the current path view
        // console.log(eventDataObj.path,path);
        const relativePath=util_pathRelative(path,eventDataObj.path);
        const relativePathParts=relativePath.split("/");
        if(relativePathParts.length!==1 || relativePathParts[0]===".."){
            // console.log("THE EVENT IS OF ANOTHER DIRECTORIES CONCERN");
            return;
        }
        //to prevent request many times by chocking some requests.. we won't...
        // contentsFetcherNotifierRef.current.setValue(exploreFolder(path));
        //instead... do the following
        const contentsFetcher=contentsFetcherNotifierRef.current.getValue();
        if(contentsFetcher==null){
            contentsFetcherNotifierRef.current.setValue(exploreFolder(path)); 
        }
        else{
            contentsFetcher.catch(function(e){}).finally(function(){
                if(contentsFetcherNotifierRef.current.getValue()!==contentsFetcher){
                    // console.log("CHOCKED POTENTIAL UNNECESSARY REQUEST");
                    return;
                }
                contentsFetcherNotifierRef.current.setValue(exploreFolder(path));
            });
        }
    };

    const contentsFetcherNotifierRef = useRef(new ValueListenerElement.ValueNotifier(null));

    return (
        <ValueListenerElement valueNotifier={contentsFetcherNotifierRef.current} renderer={function(v){
            return (
                <PromiseSnapshotElement promise={v} renderer={function(snapshot){
                    if(snapshot==null || snapshot.resolvedRejected===null){
                        return "Fetching";
                    }
                    if(snapshot.resolvedRejected===false){
                        return snapshot.data instanceof ServerResponse400Error? `Error 400: ${snapshot.data.getCode()}` : "Some uncaught error occurred";
                    }
                    const keys=Object.keys(snapshot.data);
                    return (
                        <ArrayGenerated count={keys.length} getIndexComponent={function(index){
                            const key=keys[index];
                            const content=snapshot.data[key];
                            return (
                                <section style={{
                                    width:"100%",
                                }}>
                                    {content.isDirectory? "[]":">"} {key}
                                </section>
                            );
                        }}/>
                    );
                }}/>
            );
        }}/>
    );
}

function BroadcastsManager(){
    const listenersHolders=[];

    const getListenerHolderIndex=function(listener){
        for(let i=0;i<listenersHolders.length;i++){
            if(listenersHolders[i].listener===listener){
                return i;
            }
        }
        return -1;
    }

    this.addListener=function(listener,context=null){
        const existingIndex=getListenerHolderIndex(listener);
        if(!(existingIndex>=0)){
            listenersHolders.push({
                listener,
                context,
            });
        }
    }
    this.removeListener=function(listener){
        const existingIndex=getListenerHolderIndex(listener);
        if(existingIndex>=0){
            listenersHolders.splice(existingIndex,1);
        }
    }
    this.removeListeners=function(context){
        for(let i=0;i<listenersHolders.length;i++){
            if(listenersHolders[i].context===context){
                listenersHolders.splice(i,1);
                i--;
            }
        }
    }
    this.broadcast=function(data){
        for(const listenerHolder of listenersHolders){
            listenerHolder.listener(data);
        }
    }
}

function ServerResponse400Error(code) {
    this.getCode = function () {
        return code;
    }
}


//util-methods
function util_pathRelative(from,to){ //generated with chat-gpt4, and correct 1st two lines
    const fromParts=from===""? []:from.split("/");
    const toParts=to===""? []:to.split("/");

    while(fromParts.length>0 && toParts.length>0 && fromParts[0] === toParts[0]){
        fromParts.shift();
        toParts.shift();
    }
    let relativePath="";
    for(let i=0;i<fromParts.length;i++){
        relativePath+="../";
    }
    relativePath+=toParts.join("/");
    return relativePath;
}


//business-logic
const exploreFolder = async function (path) {
    const response = await fetch(`/navigate-folder/${path}`);
    if (response.status === 200) {
        return await response.json();
    }
    if (response.status === 400) {
        throw new ServerResponse400Error(await response.text());
    }
    throw new Error(`${response.status}::${await response.text()}`);
}