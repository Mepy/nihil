const nihil = expected => {
    if(typeof(expected)=="function"){return expected}//parser
    if(expected.raw){return nihil.nihil}
    else{
        const RE = new RegExp(expected.source,expected.flags+"y");//"y" used at current
        return nihil.parser(source=>{
            const start = source.current
            RE.lastIndex = start;
            
            if(start==source.raw.length){return {
                eof:true,
                error:[{expected:String(expected),location:source.current,}],
                //error is a array [] for the convenience of merge
            }}
            
            const matchResult = source.raw.match(RE);
        
            if(matchResult)
            {
                const end = start + matchResult[0].length
                source.current = end;

                return {value:[matchResult[0]]}
                //value is a array [] for the convenience of merge
            }
            else
            {
                return {error:[{expected:String(expected),location:source.current}]}
                //error is a array [] for the convenience of merge
            }
        })
    }
}

//special result
nihil.nihil = {nihil:true}//return when nihil as a parser
nihil.eof = {eof:true}

nihil.source = raw =>({raw,current:0})
nihil.merge = (a,b)=>{
    const {value:av,error:ae} = a;
    const {value:bv,error:be} = b;

    const value = ((av!=undefined)//merge value, mainly used by nihil.and/keep/drop
    ?((bv!=undefined)
        ?[...bv,...av]
        :av)
    :((bv!=undefined)
        ?bv
        :undefined))

    const error = ((ae!=undefined)//merge error, mainly used in nihil.or
    ?((be!=undefined)
        ?((ae[0].location&&be[0].location)
            ?((ae[0].location<be[0].location)
                ?be
                :((ae[0].location==be[0].location)//when location equals, merge expected
                    ?[...ae,...be]                //otherwise drop the former(in the axis of location)
                    :ae))
            :[...ae,...be])
    :ae)

    :((be!=undefined)
        ?be
        :undefined))
    
    //when b errs, drop a.nihil, mainly used in nihil.and/keep/drop
    const nihil = (be)?b.nihil:a.nihil||b.nihil;

    const eof = a.eof||b.eof;

    return {value,error,nihil,eof}
}

nihil.and = (...parsers)=>parsers.map(nihil).reduce((A,B)=>nihil.parser(source=>{
    
    const a = A(source);
    if((a.nihil==undefined&&a.error)){return a;}
    //NO nihil BUT error => error, return a = {error,}
    //nihil AND error => nihil, error is by the way given back to the caller

    const b = B(source);
    if((b.nihil==undefined&&b.error)){return b;}
    
    return nihil.merge(a,b)
}))
nihil.or = (...parsers)=>parsers.map(nihil).reduce((A,B)=>nihil.parser(source=>{
    const current = source.current;//store for backtrack
    const a = A(source);
    if(a.value&&a.value.length!=0){return a;}
    
    source.current = current;//restore because a has no value <=> a={error,}||{nihil,}
    const b = B(source);

    if(b.value&&b.value.length!=0){return b;}

    return nihil.merge(a,b)
    
}))

nihil.keep = A=>selector=>nihil.parser(source=>{
    const a = A(source);
    if((a.nihil==undefined&&a.error)||a.eof){return a;}

    const B = selector(a.value)
    const b = B(source);
    if((b.nihil==undefined&&b.error)){return b;}

    return nihil.merge(a,b);
})
nihil.drop = A=>selector=>nihil.parser(source=>{
    const a = A(source);
    if((a.nihil==undefined&&a.error)||a.eof){return a;}

    const B = selector(a.value)
    const b = B(source);
    if((b.nihil==undefined&&b.error)){return b;}

    return nihil.merge({error:a.error,nihil:a.nihil,eof:a.eof},b);
})
nihil.box = result=>nihil.parser(source=>result)
nihil.map = parse=>f=>nihil.drop(parse)((value)=>nihil.box({value:f(value)}))

nihil.lazy = fn=>nihil.parser(source=>fn()(source));
nihil.recur = L=>I=>R=>(f=x=>x)=>{
    const fM = ()=>
    nihil.parser(
        nihil.or(
            nihil.map(
                nihil.and(
                    L,
                    nihil.lazy(fM),
                    R,
                )
            )(f)
            ,I
        )        
    )
    return fM()
}
nihil.loop = parse=>nihil.recur(parse)(nihil)(nihil)()

nihil.reverse = ({value:value})=>({value:value.reverse(),})
nihil.nest = ({value})=>({value:[value]})

nihil.sep = parse=>seper=>{
    const sep = nihil.parser(source=>{
        const a = parse(source)
    
        if((a.nihil==undefined)&&a.error||a.eof){return a}
        
        seper(source)//skip seper
        return a
    })
    return nihil.parser(source=>{
        const ret = nihil.loop(sep)(source)
        if(ret.value||ret.nihil)//when loop parse nothing, ret.nihil=true helps
        {return nihil.nest(nihil.reverse(ret))}
        else{return ret}
    })
}

nihil.parser = parse =>{
    parse.and = (...parsers)=>nihil.and(parse,...parsers)
    parse.or = (...parsers)=>nihil.or(parse,...parsers)

    parse.keep = nihil.keep(parse)
    parse.drop = nihil.drop(parse)
    parse.map = nihil.map(parse)

    parse.recur = (L,R,f=x=>x)=>nihil.recur(nihil(L))(parse)(nihil(R))(nihil(f))
    parse.loop = ()=>nihil.loop(parse)
    parse.sep = (seper)=>nihil.sep(parse)(nihil(seper))
    
    parse.candy = (raw)=>{
        const src = nihil.source(raw)
        const result = parse(src)

        //NO nihil BUT error=>error
        if(result.nihil==undefined&&result.error){return {error:result.error}}
        //no error, check eof
        else if(src.current==src.raw.length){return nihil.reverse(result)}
        else{return {error:{expected:"<eof>",location:src.current}}}
    }

    return parse
}
