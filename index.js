// var request = require('request-promise-native');
const request = require('request');
var urlencode = require('urlencode');
var fs = require('fs');
const readline = require('readline');
const tough = require('tough-cookie');
const FileCookieStore = require('tough-cookie-store');
const Rx = require('@reactivex/rxjs');

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

  return new Promise((resolve, reject)=> {

    req(options, (error, response, body) => {

      checkAuthentication(cookiejar._jar.toJSON().cookies).then((uamtk)=> {
        getNewAppToken().then((newapptk)=> {
          console.log("This is newapptk " + newapptk);

          getAppTokenPromise(newapptk).then(getMy12306).then(()=> {
            resolve();
          });
        }, (response)=> {
          console.error("getNewAppToken error "+response.statusCode);
          captcha().then(checkCaptcha).then(auth, checkCaptcha);
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
        "username": "anypossiblew",
        "password": "String0int",
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

function queryLeftTicket() {
  var query = {
    "leftTicketDTO.train_date": "2018-01-31"
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

function checkUser() {
  var url = "https://kyfw.12306.cn/otn/login/checkUser";

  var data = {
    "_json_att": ""
  };

  var headers = Object.assign({}, headers);
  headers = Object.assign(headers, {
    "Referer": "https://kyfw.12306.cn/otn/leftTicket/init"
  });

  var options = {
    url: url
    ,method: "POST"
    ,headers: headers
    ,form: data
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;

      if(response.statusCode === 200) {
        return resolve(JSON.parse(body));
      }
      reject(response.statusMessage);
    });
  });
}

function submitOrderRequest(secretStr) {
  var url = "https://kyfw.12306.cn/otn/leftTicket/submitOrderRequest";

  var data = {
    "secretStr": secretStr
    ,"train_date": "2018-01-31"
    ,"back_train_date": "2018-01-26"
    ,"tour_flag": "dc"
    ,"purpose_codes": "ADULT"
    ,"query_from_station_name": "上海"
    ,"query_to_station_name": "徐州东"
  };

  var headers = Object.assign({}, headers);
  headers = Object.assign(headers, {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    ,"Host": "kyfw.12306.cn"
    ,"Origin": "https://kyfw.12306.cn"
    ,"Referer": "https://kyfw.12306.cn/otn/leftTicket/init"
  });

  var options = {
    url: url
    ,method: "POST"
    ,headers: headers
    ,form: data
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;
      console.log(response.statusCode);
      if(response.statusCode === 200) {
        console.log(body)
      }
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
        if(train[3] == "K850") {
          checkUser().then(()=> {
            submitOrderRequest(train[0]);
          },error => {
            console.error("Check user error " + error);
          });
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
