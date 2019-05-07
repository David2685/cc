var co = require('co');
const urllib = require('urllib');
const {URL} = require('url');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const blogUrl = "http://blog.sina.com.cn/";
const userName = "chzhshch";
const userId = "1215172700";
const selectorClass = "li.SG_dot > a"
const selectorPage = "ul.SG_pages > span"
const article = "span.atc_title > a"
const articleTitle = "div.articalTitle > h2"
const articlePublishTime = "div.articalTitle > span.time"
const articleContent = "div.articalContent"
const img = "div.articalContent img"
const imgPath = path.join(__dirname,'/dir/img');
const commentImgPath = path.join(__dirname,'/dir/commentImg');
const articleCommentUrl = "http://blog.sina.com.cn/s/comment_$$.html?comment_v=articlenew"
const articlesPath = path.join(__dirname,'/dir');
const articlewithNoFormat = [
    {page:21,article:"连载1：男人进来"},
    {page:21,article:"严肃求助：希望实现一个愿望"},
    {page:21,article:"严肃求助：同性恋霸权主义"},
    {page:20,article:"《怨妇词》上"},
    {page:20,article:"《怨妇词》下"},
]


//开始函数
function *start() {
    //let articleListDic = yield _getArticleListFromClass('http://blog.sina.com.cn/s/articlelist_1215172700_10_1.html','教你炒股票');
    let articleListDic = yield _getArticleListFromClass('http://blog.sina.com.cn/s/articlelist_1215172700_0_1.html',null);
    console.log(articleListDic)
    let articleList = yield _formatListDic(articleListDic);
    yield _saveContentFromList(articleList);
}

//获取博文目录
function *_getArticleClass() {

    let articleClassResult = [];
    let mainPageUrl = new URL(userName,blogUrl).href;
    let list = yield urllib.requestThunk(mainPageUrl,{timeout: 50000});
    let html = list.data.toString();
    let $ = cheerio.load(html);

    // console.log("-----")
    // console.log(html);
    // console.log("-----")

    let articleClass = $(selectorClass);
    for(let i = 0;i < articleClass.length;i++){
        let classItem = articleClass[i];
        let item = {name:classItem.children[0].nodeValue,url:classItem.attribs.href}
        articleClassResult.push(item)
    }
    return articleClassResult;
}

//获取某一类下的所有文章地址
function *_getArticleListFromClass(classUrl,titlePrefix) {

    let baseArticleUrl = classUrl.substr(0,classUrl.length-6);
    let list = yield urllib.requestThunk(classUrl,{timeout: 50000});
    let html = list.data.toString();
    let $ = cheerio.load(html);
    let articlePageNumStr = $(selectorPage)[0].children[0].data;
    let articlePageNum = articlePageNumStr.replace(/[^0-9]/ig,"")
    let articles = $(article)
    let articleList = [];
    let returnList = {};
    for(let i = 0;i < articles.length;i++){
        let article = articles[i];
        let articleHref = article.attribs.href;
        let articleTitle = article.children[0].data;
        if(titlePrefix){
            if(articleTitle.indexOf(titlePrefix) != -1){
                articleList.push({href:articleHref,title:articleTitle})
            }
        }else{
            articleList.push({href:articleHref,title:articleTitle})
        }
    }
    returnList['page1'] = articleList;

    for(let i = 2;i <= articlePageNum;i++){
        let articleUrl = `${baseArticleUrl}${i}.html`;
        let list = yield urllib.requestThunk(articleUrl,{timeout: 50000});
        let html = list.data.toString();
        let $ = cheerio.load(html);
        let articles = $(article);
        let articleList = [];
        for(let i = 0;i < articles.length;i++){
            let article = articles[i];
            let articleHref = article.attribs.href;
            let articleTitle = article.children[0].data;
            if(titlePrefix){
                if(articleTitle.indexOf(titlePrefix) != -1){
                    articleList.push({href:articleHref,title:articleTitle})
                }
            }else{
                articleList.push({href:articleHref,title:articleTitle})
            }
        }
        let key = `page${i}`;
        returnList[key] = articleList;
    }
    return returnList;
}

//格式化
function *_formatListDic(listDic) {

    let allArticleList = [];
    for(let key in listDic){

        let listObj = listDic[key];
        let list = listObj.map(function (item) {
            return item.href;
        })
        allArticleList = allArticleList.concat(list);
    }
    return allArticleList.reverse()
}

//保存列表中的所有文章标题和内容
function *_saveContentFromList(articleList) {
    let reg = new RegExp(articlewithNoFormat.reduce((pre,cur)=>{
        return pre += cur.article + '|'
    },''));
    for(let i = 0; i < articleList.length;i++){

        let articleUrl = articleList[i];
        let articlePage = yield urllib.requestThunk(articleUrl,{timeout: 50000});
        let html = articlePage.data.toString();
        let $ = cheerio.load(html);

        let title ,time,articleId,oriTitle;

        $(articleTitle).each(function (i,elem) {
            title = $(this).text();
            oriTitle = title;
            articleId = $(this).attr('id').substring(2)
        });
        $(articlePublishTime).each(function (i,elem) {
            time = $(this).text();
        })
        title =`\n\n\#\<\a name=\"${('00'+(i+1)).substr(-3)}\">${title} ${time}\<\/a\>`;

        let imgs = $(img);
        for(let j = 0;j < imgs.length;j++){
            let img = imgs[j];
            let imgUrl = $(img).attr('real_src');
            yield _downloadImg(`${imgPath}\/${i+1}_${j}.jpg`,imgUrl);
            $(img).text(`\!\[\]\(\.\/img\/${i+1}_${j}.jpg\)`);

        }
        $('a').remove();
        //debug
        // if(i == 41){
        //     let temp = $(articleContent).map(function (i, elem) {
        //         return $(this).text();
        //     }).get()
        //     console.log('123')
        // }
        //debug
        let content = $(articleContent).map(function (i, elem) {
           return $(this).text();
        }).get().join('');
        content = _removeStr(content, '浏览“缠中说禅”更多文章请点击进入');
        //console.log(content)

        if(!reg.test(oriTitle)){
            content = _formatContent1(content);
        }
        console.log(title)
        fs.writeFileSync(`${articlesPath}\/blog.md`,title+'\n'+content,{flag:'a'});
        let commentUrlTemplate = articleCommentUrl.replace('$$',`${articleId}_~~`);
        let comments = yield _saveCommentFromUrl(commentUrlTemplate.replace('~~','1'),commentUrlTemplate,articleId);
    }
}

//保存文章评论
function *_saveCommentFromUrl(commentUrl,urlTemplate,articleId){
    let commentResult = [];
    let comments = yield urllib.requestThunk(commentUrl,{timeout: 50000});
    let data = JSON.parse(comments.data.toString());
    comments = data.data.comment_data.map(function (item) {

        let body = _removeTag(decodeURIComponent(item.cms_body));
        if(!_isNeedRemove(body)) {
            return {num:item.cms_n,userName:item.uname,time:item.cms_pubdate,content:body}
        }else{
            return {num:item.cms_n,userName:item.uname,time:item.cms_pubdate,content:''}
        }
    });
    commentResult = commentResult.concat(comments);
    let totalPage = Math.ceil((data.data.comment_total_num/data.data.comment_num));
    for(let i = 2;i <= totalPage;i ++){
        console.log(i)
        let url = urlTemplate.replace('~~',`${i}`);
        let comments = yield urllib.requestThunk(url,{timeout: 50000});
        comments = JSON.parse(comments.data.toString());
        comments = comments.data.comment_data.map(function (item) {
            let body = _removeTag(decodeURIComponent(item.cms_body));
            if(!_isNeedRemove(body)) {
                return {num: item.cms_n, userName: item.uname, time: item.cms_pubdate, content: body}
            }else{
                return {num:item.cms_n,userName:item.uname,time:item.cms_pubdate,content:''}
            }
        });
        commentResult = commentResult.concat(comments);
    }
    for(let i = 0;i < commentResult.length;i++){
        let comment = commentResult[i]
        let commentContent = `\n\nNo.${comment.num}\n\n\> ${comment.userName}(${comment.time})\n\n\>\> ${comment.content}`
        commentContent = yield _saveImgFromComment(commentContent,articleId,comment.num)
        fs.writeFileSync(`${articlesPath}\/blog.md`,commentContent,{flag:'a'});
    }
}

//文章格式处理
//处理格式为\nXXX的文章
function _formatContent1(content) {
    let result = content.match(/\n[  ]*\S{1,}[  \t]*\S{1,}/g);
    return result.join('\n')
}

//删除文章中的特定字符串
function _removeStr(content,str) {
    return content.replace(str,'');
}

//处理评论中的<br>,&nbsp;标签,-,=符号
function _removeTag(comment) {
    comment = comment.replace(/\<br\>/g,'\n>> ');
    comment = comment.replace(/&nbsp;/g,' ');//该语句顺序必须在第二位置
    comment = comment.replace(/^([\-\=]{1,})/g,function (match,p1,offset,string) {
        return `\n>>\n>>\\${p1}\n>>`
    })
    comment = comment.replace(/\n>> *([\-\=]{1,})/g,function (match,p1,offset,string) {
        return `\n>>\n>>\\${p1}\n>>`
    })
    comment = comment.replace(/ {1,}([\-\=]{2,})/g,function (match,p1,offset,string) {
        return `\n>>\n>>\\${p1}\n>>`
    })
    comment = comment.replace(/^ {1,}(\S{1,})/g,function(match,p1,offset,string){
        return `\n>>${p1}`
    })
    return comment.replace(/\n>> *(\S{1,})/g,function(match,p1,offset,string){
        return `\n>>${p1}`
    })
}

//过滤评论
function _isNeedRemove(comment) {
    if(comment.indexOf('TrackBack by') == 0){
        return true
    }else{
        return false
    }
}

//保存评论中的图片
function *_saveImgFromComment(comment,articleId,no) {
    let imgUrl;
    let picName;
    //<img[ \S]* src="(\S{1,})"((?!<img).)*\/>
    //<img src="(\S{1,})" ((?!<img).)* \/>
    let result = comment.replace(/<img[ \S]* src="(\S{1,})"((?!<img).)*\/>/g,function (match,p1,p2,offset,string) {
        imgUrl = p1;
        picName = `${articleId}_${no}_${offset}.jpg`;
        return `\!\[\]\(\.\/commentImg\/${articleId}_${no}_${offset}.jpg\)`
    })
    if(imgUrl){
        yield _downloadImg(`${commentImgPath}/${picName}`,imgUrl);
    }
    return result;
}

//保存图片
function *_downloadImg(path,imgUrl) {
    try{

        let imgData = yield urllib.requestThunk(imgUrl,{timeout: 50000});
        if(imgData.status == "301" || imgData.status == "302"){
            imgData = yield urllib.requestThunk(imgData.headers.location,{timeout: 50000});
        }
        fs.writeFileSync(`${path}`,imgData.data);
    }catch (e){
        console.log(`图片未能下载：${imgUrl}`)
    }
}
co(start);