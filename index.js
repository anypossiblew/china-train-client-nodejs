// var request = require('request-promise-native');
const request = require('request');
var urlencode = require('urlencode');
var fs = require('fs');
const readline = require('readline');
const tough = require('tough-cookie');
const FileCookieStore = require("tough-cookie-store");

var cookie = new tough.Cookie({
    key: "some_key",
    value: "some_value",
    domain: 'kyfw.12306.cn',
    httpOnly: true,
    maxAge: 31536000
});

var fileStore = new FileCookieStore("./cookies.json", {encrypt: false});
fileStore.option = {encrypt: false};

var cookiejar = request.jar(fileStore);
// var cookiejar = new tough.CookieJar();
// cookiejar.setCookie(cookie, "https://kyfw.12306.cn/otn/passport");

var req = request.defaults({jar: cookiejar});

var headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.17 (KHTML, like Gecko) Chrome/24.0.1312.60 Safari/537.17",
    "Host": "kyfw.12306.cn",
    "Referer": "https://kyfw.12306.cn/otn/passport?redirect=/otn/"
};

function login() {

  var url = "https://kyfw.12306.cn/otn/login/init";
  var options = {
    url: url,
    headers: headers
  };

  // Continuous call authenticate util success!
  var auth = function() {
    console.log("Authenticating ...");
    authenticate().then((uamtk) => {
      console.log("uamtk = " + uamtk);
      return uamtk;
    }, (reseaon) => {
      if(reseaon.result_code == 5) {
        return captcha().then(checkCaptcha).then(auth);
      }else {
        auth();
      }
    })
    .catch((error) => {
      console.error("错误！" + error);
    });
  };

  req(options, (error, response, body) => {

    checkAuthentication(cookiejar._jar.toJSON().cookies).then((uamtk)=> {
      getNewAppToken().then((newapptk)=> {
        console.log("This is newapptk " + newapptk);
        getMy12306();
      }, (response)=> {
        console.error("getNewAppToken error "+response.statusCode);

      });
    }, ()=> {
      return captcha().then(checkCaptcha).then(auth, checkCaptcha);
    });

    // .then((uamtk) => {
    //
    // })
    // .catch((error) => {
    //   console.error("遇见错误退出！" + error);
    // });
  });

  // .then(()=> {
  //   console.log(cookiejar._jar.toJSON().cookies);
  // })

    // .then(captcha)
    // .then(checkCaptcha)
    // .then(auth)
    // .then((uamtk) => {
    //   console.log(cookiejar.toJSON());
    // })
    // .catch((error) => {
    //   console.error("遇见错误退出！" + error);
    // });
}

/**
 * Check authenticattion
 */
function checkAuthentication(cookies) {
  return new Promise((resolve, reject) => {
    for(var i = 0; i < cookies.length; i++) {
      //
      if(cookies[i].key == "uamtk") {
        return resolve(cookies[i].value);
      }
    }
    reject();
  });
}

function captcha() {

  var data = {
        "login_site": "E",
        "module": "login",
        "rand": "sjrand",
        "0.17231872703389062":""
    };

  var param = urlencode.stringify(data);
  var url = "https://kyfw.12306.cn/passport/captcha/captcha-image?"+param;
  var options = {
    url: url
    ,headers: headers
  };

  return new Promise((resolve, reject) => {
    req(options, (error, response, body) => {
      if(error) {
        console.error(error);
        reject(error);
      }
    }).pipe(fs.createWriteStream("captcha.BMP")).on('close', function(){
      resolve();
    });
  });

}

function checkCaptcha() {
  var url = "https://kyfw.12306.cn/passport/captcha/captcha-check";

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve, reject) => {
    rl.question('请输入验证码:', (positions) => {
      rl.close();

      var data = {
          "answer": positions,
          "login_site": "E",
          "rand": "sjrand"
        };

      var options = {
        url: url
        ,headers: Object.assign({
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
          ,"Accept": "application/json, text/javascript, */*; q=0.01"
          ,"Host": "kyfw.12306.cn"
          ,"Origin": "https://kyfw.12306.cn"
          ,"Referer": "https://kyfw.12306.cn/otn/login/init"
        }, headers)
        ,method: 'POST'
        ,form: data
      };

      req(options, (error, response, body) => {
        if(error) {
          console.error(error);
        }
        if(response.statusCode === 200) {
          body = JSON.parse(body);
          console.log(body.result_message);
          if(body.result_code == 4) {
            resolve();
          }
          reject();
        }else {
          console.log('error: '+ response.statusCode);
          console.log(response.text);
          reject();
        }
      });
    });
  });
}

function authenticate() {
  // 发送登录信息
  var data = {
        "username": "anypossible",
        "password": "ruby0nrails",
        "appid": "otn"
    };

  var url = "https://kyfw.12306.cn/passport/web/login";

  var options = {
    url: url
    ,headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.17 (KHTML, like Gecko) Chrome/24.0.1312.60 Safari/537.17"
      ,"Host": "kyfw.12306.cn"
      ,"Referer": "https://kyfw.12306.cn/otn/passport?redirect=/otn/"
      ,'content-type': 'application/x-www-form-urlencoded'
    }
    ,method: 'POST'
    ,form: data
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) return reject(error);

      if(response.statusCode === 200) {
        console.log(body);
        body = JSON.parse(body);
        console.log(body.result_message);
        if(body.result_code != 0) {
          reject(body);
        }else {
          resolve(body.uamtk);
        }
      }else {
        reject(response);
      }
    });
  });

}

function getNewAppToken() {
  var data = {
        "appid": "otn"
    };

  var options ={
    url: "https://kyfw.12306.cn/passport/web/auth/uamtk"
    ,headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.17 (KHTML, like Gecko) Chrome/24.0.1312.60 Safari/537.17"
      ,"Host": "kyfw.12306.cn"
      ,"Referer": "https://kyfw.12306.cn/otn/passport?redirect=/otn/"
      ,'content-type': 'application/x-www-form-urlencoded'
    }
    ,method: 'POST'
    ,form: data
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;

      if(response.statusCode === 200) {
        console.log(body);
        body = JSON.parse(body);
        console.log(body.result_message);
        if(body.result_code == 0) {
          resolve(body.newapptk);
        }else {
          reject(body);
        }
      }else {
        reject(response)
      }
    });
  });
}

function getMy12306() {
  req({url: "https://kyfw.12306.cn/otn/index/initMy12306"
       ,headers: headers
       ,method: "GET"}, (error, response, body)=> {
    if(response.statusCode === 200) {
      console.log(body);
      console.log(body.substr(body.indexOf("用户名"), 20));
    }
  })
}

/**
 * 听说得到的apptk和newapptk一样，暂时就不用了
 */
function getAppToken(newapptk) {
  var data = {
        "tk": newapptk
    };
  var options = {
    url: "https://kyfw.12306.cn/otn/uamauthclient"
    ,headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.17 (KHTML, like Gecko) Chrome/24.0.1312.60 Safari/537.17"
      ,"Host": "kyfw.12306.cn"
      ,"Referer": "https://kyfw.12306.cn/otn/passport?redirect=/otn/"
      ,'content-type': 'application/x-www-form-urlencoded'
    }
    ,method: 'POST'
    ,form: data
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;

      if(response.statusCode === 200) {
        console.log(body);
        body = JSON.parse(body);
        console.log(body.result_message);
        if(body.result_code == 0) {
          resolve(body.apptk);
        }else {
          reject(body);
        }
      }else {
        reject(response)
      }
    });
  });
}

// function storeCookies() {
//   var Cookie = tough.Cookie;
//   var cookie = Cookie.parse("Cookie:_passport_session=65ad591d4a194e6984661607c4191cff8327; _passport_ct=7de1283a603b47e1b53adcd7fd15ea39t4090; route=495c805987d0f5c8c84b14f60212447d; BIGipServerotn=1490616586.50210.0000; BIGipServerpassport=887619850.50215.0000; RAIL_EXPIRATION=1516888514432; RAIL_DEVICEID=BUDllF83rIg8WbCrkztInw4nMU-21NIjmLDk5wS_lbQ1RlQwbORtlKtfFAGXHfv7VVlz6s6m38DnkcJIHmkaz4dh4OIM-ybyZ4cQpBZtDosbFu53hl8WWH-iYIvo3HsNIZfkS0qpfQMVgf9Zy1h-ytrTfozna-B4; current_captcha_type=Z; _jc_save_wfdc_flag=dc; _jc_save_fromStation=%u4E0A%u6D77%2CSHH; _jc_save_toStation=%u5F90%u5DDE%u4E1C%2CUUH; _jc_save_showIns=true; _jc_save_toDate=2018-01-24; _jc_save_fromDate=2018-02-10; acw_tc=AQAAAJaiRTFGTQcAWSxrcbmdQsQieRp9");
//   cookie.value = 'somethingdifferent';
//   var header = cookie.toString();
//   console.log(header);
//
//   var cookiejar = new tough.CookieJar();
//   cookiejar.setCookie(cookie, 'http://currentdomain.example.com/path', (res) => {
//     console.log(res);
//   });
// }

login();
