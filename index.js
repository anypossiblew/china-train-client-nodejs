// var request = require('request-promise-native');
const request = require('request');
var urlencode = require('urlencode');
var fs = require('fs');
const readline = require('readline');
const tough = require('tough-cookie');
const FileCookieStore = require('tough-cookie-store');
const Rx = require('@reactivex/rxjs');

const ACCOUNT = {
  "username": "anypossiblew"
  ,"password": "String0int"
};

const TRAIN_DATE = "2018-01-31";

// const getPassengers =  require('./passenger');

var fileStore = new FileCookieStore("./cookies.json", {encrypt: false});
fileStore.option = {encrypt: false};

var cookiejar = request.jar(fileStore);

var req = request.defaults({jar: cookiejar});

const headers = {
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
  ,"User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.17 (KHTML, like Gecko) Chrome/24.0.1312.60 Safari/537.17"
  ,"Host": "kyfw.12306.cn"
  ,"Origin": "https://kyfw.12306.cn"
  ,"Referer": "https://kyfw.12306.cn/otn/passport?redirect=/otn/"
};

// 授权认证
var subjectAuth = new Rx.Subject();
// 授权成功
var subjectAuthenticated = new Rx.Subject();
// Captcha
var subjectCaptcha = new Rx.Subject();

function login() {

  subjectCaptcha.subscribe(x=> {
    captcha().then(checkCaptcha)
      .then(()=> {
        // 校验码成功后进行授权认证
        subjectAuth.next();
      }, error=> {
        // 校验失败，重新校验
        subjectCaptcha.next();
      });
  });

  subjectAuth.subscribe(()=> {
    authenticate().then(uamtk=>subjectAuthenticated.next(uamtk),
      error=>subjectAuth.next());
  });

  var url = "https://kyfw.12306.cn/otn/login/init";
  var options = {
    url: url,
    headers: headers
  };

  return new Promise((resolve, reject)=> {

    req(options, (error, response, body) => {

      checkAuthentication(cookiejar._jar.toJSON().cookies).then((uamtk)=> {
        // TODO Cookie存在uamtk则拿来进行认证，应该直接校验登录
        getMy12306().then(resolve, reject);
      }, error=> {
          // 验证认证失败，重新认证
          subjectCaptcha.next();
        });
    });

    subjectAuthenticated.subscribe(x=> {
      getNewAppToken().then((newapptk)=> {
          console.log("This is newapptk " + newapptk);
          getAppTokenPromise(newapptk).then(getMy12306).then(()=> {
            resolve();
          });
        }, (response)=> {
          console.error("getNewAppToken error "+response.statusCode);
          // 重新认证
          subjectCaptcha.next();
        });
    });
  });
}

/**
 * Check authenticattion
 */
function checkAuthentication(cookies) {
  var uamtk = "", tk = "";
  for(var i = 0; i < cookies.length; i++) {
    if(cookies[i].key == "uamtk") {
      uamtk = cookies[i].value;
    }

    if(cookies[i].key == "tk") {
      tk = cookies[i].value;
    }
  }

  if(tk) {
    return getAppToken(tk);
  }else if(uamtk) {
    return getNewAppToken().then(getAppToken);
  }
  return Promise.reject();
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
  var data = Object.assign({
        "appid": "otn"
      }, ACCOUNT);

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
        // console.log(body);
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
  return new Promise((resolve, reject)=> {
    req({url: "https://kyfw.12306.cn/otn/index/initMy12306"
         ,headers: headers
         ,method: "GET"}, (error, response, body)=> {
      if(response.statusCode === 200) {
        console.log("Got my 12306");
        return resolve();
      }
      reject();
    });
  });
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
        // console.log(body);
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

function getAppTokenPromise(newapptk) {

  var subjectGetAppToken = new Rx.Subject();

  return new Promise((resolve, reject) => {

    subjectGetAppToken.subscribe(newapptk => {
      getAppToken(newapptk).then(x => {
        resolve(x);
      }, error=> {
        subjectGetAppToken.next(newapptk);
      });
    });

    subjectGetAppToken.next(newapptk);
  });
}

function getPassengers(token) {
  var url = "https://kyfw.12306.cn/otn/confirmPassenger/getPassengerDTOs";

  var myHeaders = Object.assign({}, headers);
  myHeaders = Object.assign(myHeaders, {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    ,"Referer": "https://kyfw.12306.cn/otn/confirmPassenger/initDc"
  });

  var data = {
    "_json_att": ""
    ,"REPEAT_SUBMIT_TOKEN": token
  };

  var options = {
    url: url
    ,method: "POST"
    ,headers: myHeaders
    ,form: data
  };

  req(options, (error, response, body)=> {
    if(error) throw error;

    if(response.statusCode === 200) {
      console.log(body);
    }else {
      console.log(response.statusCode);
    }
  });
}

function leftTicketInit() {
  var url = "https://kyfw.12306.cn/otn/leftTicket/init";

  return new Promise((resolve, reject)=> {
    req(url, (error, response, body)=> {
      if(error) throw error;

      if(response.statusCode === 200) {
        return resolve();
      }
      reject(response.statusText);
    });
  });
}

function queryLeftTicket() {
  var query = {
    "leftTicketDTO.train_date": TRAIN_DATE
    ,"leftTicketDTO.from_station":"SHH"
    ,"leftTicketDTO.to_station":"UUH"
    ,"purpose_codes": "ADULT"
  }

  var param = urlencode.stringify(query);

  var url = "https://kyfw.12306.cn/otn/leftTicket/queryZ?"+param;

  return new Promise((resolve, reject)=> {
    req(url, (error, response, body)=> {
      if(error) throw error;
      // console.log(response.statusCode);
      // console.log(body);
      if(response.statusCode === 200) {
        if(!body) {
          return reject(response.statusCode);
        }
        if(body.indexOf("请您重试一下") > 0) {
          reject("系统繁忙!");
        }else {
          try {
            var data = JSON.parse(body).data;
          }catch(err) {
            console.log(body);
            reject(err);
          }
          resolve(data);
        }
      }else {
        console.log(response.statusCode);
        reject();
      }
    });
  });

}

var sjSmOReqCheckUser = new Rx.Subject();
function checkUser() {
  var url = "https://kyfw.12306.cn/otn/login/checkUser";

  var data = {
    "_json_att": ""
  };

  var options = {
    url: url
    ,method: "POST"
    ,headers: Object.assign(Object.assign({}, headers), {
      "If-Modified-Since": "0"
      ,"Cache-Control": "no-cache"
      ,"Referer": "https://kyfw.12306.cn/otn/leftTicket/init"
    })
    ,form: data
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;

      if(response.statusCode === 200) {
        body = JSON.parse(body)
        if(body.data.flag) {
          return resolve();
        }
        return reject(body);
      }
      reject(response.statusMessage);
    });
  });
}

var sjSmOReqSubmit = new Rx.Subject();
function submitOrderRequest(secretStr) {
  var url = "https://kyfw.12306.cn/otn/leftTicket/submitOrderRequest";

  var data = {
    "secretStr": secretStr
    ,"train_date": TRAIN_DATE
    ,"back_train_date": "2018-01-30"
    ,"tour_flag": "dc"
    ,"purpose_codes": "ADULT"
    ,"query_from_station_name": "上海"
    ,"query_to_station_name": "徐州东"
    ,"undefined":""
  };

  // url = url + "secretStr="+secretStr+"&train_date=2018-01-31&back_train_date=2018-01-30&tour_flag=dc&purpose_codes=ADULT&query_from_station_name=上海&query_to_station_name=徐州东&undefined";
  var options = {
    url: url
    ,method: "POST"
    ,headers: Object.assign(Object.assign({}, headers), {
      "If-Modified-Since": "0"
      ,"Cache-Control": "no-cache"
      ,"Referer": "https://kyfw.12306.cn/otn/leftTicket/init"
    })
    ,form: data
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;
      if(response.statusCode === 200) {
        body = JSON.parse(body);
        if(body.status) {
          return resolve(body);
        }
        return reject(body.messages[0]);
      }
      reject(response.statusCode);
    });
  });
}

var subjectQuery = new Rx.Subject();

subjectQuery.subscribe(x => {

  queryLeftTicket().then(trainsData => {
    //console.log(trainsData);
    var trains = trainsData.result;

    console.log("查询到火车数量 "+trains.length);

    trains.forEach(function(train) {
      train = train.split("|");

      if(train[29] > 0 && train[29] != "无" && train[29] != "0") {
        console.log(train[3]);
        if(train[3] == "K188") {
          console.log(train);
          sjSmOReqCheckUser.next(train[0]);
        }
      }
    });
  }, err => {
    console.error(err);
    setTimeout(()=> {
      subjectQuery.next();
    }, 1500);

  });

});

sjSmOReqCheckUser.subscribe(train=> {
  checkUser().then(()=>sjSmOReqSubmit.next(train), error => {
    console.error("Check user error " + error);
    sjSmOReqCheckUser.next(train);
  });
});

sjSmOReqSubmit.subscribe(train=>
  submitOrderRequest(train).then(()=> console.log("Submit Order Request success!"), error=> {
    console.error("SubmitOrderRequest error " + error);
    sjSmOReqSubmit.next(train);
  })
);

login().then(leftTicketInit)
.then(()=> {
  subjectQuery.next();
}, error=> {
  console.error(error);
})
.catch(error=> {
  console.error(error);
})


// login().

// getPassengers("646e4784223f4f849716c9a5ac96716f0608");

//login().then(getPassengers);

//login();
