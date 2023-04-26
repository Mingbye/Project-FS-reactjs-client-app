import React, { useEffect, useState } from "react";
import { Children } from "react";

export function Builder({ renderer }) {
    return renderer();
}

export function ArrayGenerated({ count, getIndexComponent }) {
    const generated = [];
    for (let i = 0; count >= 0 && i < count; i++) {
        generated.push(getIndexComponent(i));
    }
    return Children.toArray(generated);
}


export class ValueListenerElement extends React.Component {
    constructor(props) {
        super(props);
        this.props = props;
        this.valueListener = this.valueListener.bind(this);
    }

    valueListener() {
        this.setState(function (x) {
            return {};
        });
    }

    componentDidMount() {
        this.props.valueNotifier.addListener(this.valueListener);
    }

    componentWillUnmount() {
        this.props.valueNotifier.removeListener(this.valueListener);
    }

    render() {
        return this.props.renderer(this.props.valueNotifier.getValue());
    }
}

ValueListenerElement.ValueNotifier = function (value) {
    const listeners = [];
    this.getValue = function () {
        return value;
    }
    this.setValue = function (v) {
        value = v;
        for (const listener of listeners) {
            listener();
        }
    }
    this.hardUpdate = function (invokable = null) {
        if (invokable) {
            invokable(value);
        }
        for (const listener of listeners) {
            listener();
        }
    }
    this.addListener = function (listener) {
        const index = listeners.indexOf(listener);
        if (!(index >= 0)) {
            listeners.push(listener);
        }
    }
    this.removeListener = function (listener) {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
            listeners.splice(index, 1);
        }
    }
}




export function PromiseSnapshotElement({
    promise=null,
    renderer,
}){

    const [snapshot, setSnapshot]=useState(promise||undefined? {
        resolvedRejected:null,
        data:null,
    }:null);

    useEffect(function(){
        if(promise||undefined){
            promise.then(function(value){
                setSnapshot(function(){
                    return {
                        resolvedRejected:true,
                        data:value,
                    };
                });
            }).catch(function(e){
                setSnapshot(function(){
                    return {
                        resolvedRejected:false,
                        data:e,
                    }
                })
            });
        }
    });

    return renderer(snapshot);
}








/**
 * <HtmlElementBuilder style={{
 *   background:"blue",
 * }} onBuilt={function(element){
 *   //element.innerText="SAMPLE TEXT";
 *   element.appendChild(...);
 * }}/>
 */
export class HtmlElementBuilder extends React.Component {
    elementHolderRef = React.createRef(null);

    constructor(props) {
        super(props);
        this.props = props;
    }

    componentDidMount() {
        const element = this.elementHolderRef.current;
        this.props.onBuilt(element);
    }

    render() {
        return (
            <section ref={this.elementHolderRef} style={this.props.style}></section>
        );
    }
}