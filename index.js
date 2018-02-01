// var request = require('request-promise-native');
const request = require('request');
const querystring = require('querystring');
const fs = require('fs');
const readline = require('readline');
const tough = require('tough-cookie');
const FileCookieStore = require('tough-cookie-store');
const Rx = require('@reactivex/rxjs');
const chalk = require('chalk');

const ACCOUNT = {
  "username": "xxxxxxxxxxxxxx"
  ,"password": "xxxxxxxxxxx"
};

const TRAIN_DATE = "2018-02-01";
const BACK_TRAIN_DATE = "2018-02-01";
const PLAN_TRAINS = ["G150", "G152", "G216", "G24", "G1940", "G44", "G298", "G1826", "G7600", "G7176", "G7590", "G368", "G7178", "G7300"];
const PLAN_PEPOLES = ["王体文"];

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

const SYSTEM_BUSSY = "System is bussy";
const SYSTEM_MOVED= "Moved Temporarily";
/**
 * 检查网络异常
 */
function isSystemBussy(body) {
  return body.indexOf("网络可能存在问题，请您重试一下") > 0;
}

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

  var param = querystring.stringify(data, null, null)
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
    rl.question(chalk`{red.bold 请输入验证码}:`, (positions) => {
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

  var param = querystring.stringify(query);

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

// 预提交订单
var sjSmOReqSubmit = new Rx.Subject();
function submitOrderRequest(secretStr) {
  var url = "https://kyfw.12306.cn/otn/leftTicket/submitOrderRequest";

  var data = {
    "secretStr": querystring.unescape(secretStr)
    ,"train_date": TRAIN_DATE
    ,"back_train_date": BACK_TRAIN_DATE
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

// 模拟跳转页面InitDc，Post
var sjInitDc = new Rx.Subject();
function confirmPassengerInitDc() {
  var url = "https://kyfw.12306.cn/otn/confirmPassenger/initDc";
  var data = {
    "_json_att": ""
  };
  var options = {
    url: url
    ,method: "POST"
    ,headers: Object.assign(Object.assign({}, headers), {
      "Content-Type": "application/x-www-form-urlencoded"
      ,"Referer": "https://kyfw.12306.cn/otn/leftTicket/init"
      ,"Upgrade-Insecure-Requests":1
    })
    ,form: data
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;

      if(response.statusCode === 200) {
        if(isSystemBussy(body)) {
          return reject(SYSTEM_BUSSY);
        }
        if(body) {
          // Get Repeat Submit Token
          var token = body.match(/var globalRepeatSubmitToken = '(.*?)';/);
          var ticketInfoForPassengerForm = body.match(/var ticketInfoForPassengerForm=(.*?);/);
          var orderRequestDTO = body.match(/var orderRequestDTO=(.*?);/);
          if(token) {
            return resolve({
              token: token[1]
              ,ticketInfo: ticketInfoForPassengerForm&&JSON.parse(ticketInfoForPassengerForm[1].replace(/'/g, "\""))
              ,orderRequest: orderRequestDTO&&JSON.parse(orderRequestDTO[1].replace(/'/g, "\""))
            });
          }
        }
        return reject(SYSTEM_BUSSY);
      }
      reject(response.statusMessage);
    });
  });
}

// 常用联系人确定，Post
var sjPassengers = new Rx.Subject();
function getPassengers(token) {
  var url = "https://kyfw.12306.cn/otn/confirmPassenger/getPassengerDTOs";

  var data = {
    "_json_att": ""
    ,"REPEAT_SUBMIT_TOKEN": token
  };

  var options = {
    url: url
    ,method: "POST"
    ,headers: Object.assign(Object.assign({}, headers), {
      "Referer": "https://kyfw.12306.cn/otn/confirmPassenger/initDc"
    })
    ,form: data
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;

      if(response.statusCode === 200) {
        if((response.headers["content-type"] || response.headers["Content-Type"]).indexOf("application/json") > -1) {
          return resolve(JSON.parse(body));
        }
      }

      reject(response.statusMessage);
    });
  });

}

/* seat type
‘软卧’ => ‘4’,
‘二等座’ => ‘O’,
‘一等座’ => ‘M’,
‘硬座’ => ‘1’,
 */
function getPassengerTickets(passengers) {
  var tickets = [];
  passengers.forEach(passenger=> {
    if(PLAN_PEPOLES.includes(passenger.passenger_name)) {
      //座位类型,0,票类型(成人/儿童),name,身份类型(身份证/军官证....),身份证,电话号码,保存状态
      var ticket = /*passenger.seat_type*/ "O" +
              ",0," +
              /*limit_tickets[aA].ticket_type*/"1" + "," +
              passenger.passenger_name + "," +
              passenger.passenger_id_type_code + "," +
              passenger.passenger_id_no + "," +
              (passenger.phone_no || "" ) + "," +
              "N";
      tickets.push(ticket);
    }
  });

  return tickets.join("_");
}

function getOldPassengers(passengers) {
  var tickets = [];
  passengers.forEach(passenger=> {
    if(PLAN_PEPOLES.includes(passenger.passenger_name)) {
      //name,身份类型,身份证,1_
      var ticket =
              passenger.passenger_name + "," +
              passenger.passenger_id_type_code + "," +
              passenger.passenger_id_no + "," +
              "1";
      tickets.push(ticket);
    }
  });

  return tickets.join("_")+"_";
}

//
var sjCheckOrderInfo = new Rx.Subject();
function checkOrderInfo(submitToken, passengers) {
  var url = "https://kyfw.12306.cn/otn/confirmPassenger/checkOrderInfo";

  var data = {
    "cancel_flag": 2
    ,"bed_level_order_num": "000000000000000000000000000000"
    ,"passengerTicketStr": getPassengerTickets(passengers)
    ,"oldPassengerStr": getOldPassengers(passengers)
    ,"tour_flag": "dc"
    ,"randCode": ""
    ,"whatsSelect":1
    ,"_json_att": ""
    ,"REPEAT_SUBMIT_TOKEN": submitToken
  };

  var options = {
    url: url
    ,method: "POST"
    ,headers: Object.assign(Object.assign({}, headers), {
      "Referer": "https://kyfw.12306.cn/otn/confirmPassenger/initDc"
    })
    ,form: data
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;

      if(response.statusCode === 200) {
        if((response.headers["content-type"] || response.headers["Content-Type"]).indexOf("application/json") > -1) {
          return resolve(JSON.parse(body));
        }
      }

      reject(response.statusMessage);
    });
  });

}

function getQueueCount(token, orderRequestDTO, ticketInfo) {
  var url = "https://kyfw.12306.cn/otn/confirmPassenger/getQueueCount";
  var data = {
    "train_date": new Date(orderRequestDTO.train_date.time).toString()
    ,"train_no": orderRequestDTO.train_no
    ,"stationTrainCode": orderRequestDTO.station_train_code
    ,"seatType":1
    ,"fromStationTelecode": orderRequestDTO.from_station_telecode
    ,"toStationTelecode": orderRequestDTO.to_station_telecode
    ,"leftTicket": ticketInfo.queryLeftTicketRequestDTO.ypInfoDetail
    ,"purpose_codes": "00"
    ,"train_location": ticketInfo.train_location
    ,"_json_att": ""
    ,"REPEAT_SUBMIT_TOKEN": token
  };

  var options = {
    url: url
    ,method: "POST"
    ,headers: Object.assign(Object.assign({}, headers), {
      "Referer": "https://kyfw.12306.cn/otn/confirmPassenger/initDc"
    })
    ,form: data
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;

      if(response.statusCode === 200) {
        if((response.headers["content-type"] || response.headers["Content-Type"]).indexOf("application/json") > -1) {
          return resolve(JSON.parse(body));
        }
      }

      reject(response.statusMessage);
    })
  })
}

function getPassCodeNew() {
  var url = "https://kyfw.12306.cn/otn/passcodeNew/getPassCodeNew?module=passenger&rand=randp&"+Math.random(0,1);
  var options = {
    url: url
    ,headers: Object.assign(Object.assign({}, headers), {
      "Referer": "https://kyfw.12306.cn/otn/confirmPassenger/initDc"
    })
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;
      if(response.statusCode!==200) reject(response.statusMessage);
    }).pipe(fs.createWriteStream("captcha.BMP")).on('close', function(){
      resolve();
    });
  });

}

function checkRandCodeAnsyn() {
  var url = "https://kyfw.12306.cn/otn/passcodeNew/checkRandCodeAnsyn";
  var data = {
    randCode: "",
    rand: "randp"
  };
  var options = {
    url: url
    ,method: "POST"
    ,headers: Object.assign(Object.assign({}, headers), {
      "Referer": "https://kyfw.12306.cn/otn/confirmPassenger/initDc"
    })
    ,form: data
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve, reject)=> {
    rl.question('Please input randcode:', (positions) => {
      rl.close();

      options.form.randCode = positions;
      req(options, (error, response, body)=> {
        if(error) throw error;

        if(response.statusCode === 200) {
          if((response.headers["content-type"] || response.headers["Content-Type"]).indexOf("application/json") > -1) {
            return resolve(JSON.parse(body));
          }
        }

        reject(response.statusMessage);
      })
    });
  })
}

//
var sjCfSingleForQueue = new Rx.Subject();
function confirmSingleForQueue(token, passengers, ticketInfoForPassengerForm) {
  var url = "https://kyfw.12306.cn/otn/confirmPassenger/confirmSingleForQueue";
  var data = {
    "passengerTicketStr": getPassengerTickets(passengers)
    ,"oldPassengerStr": getOldPassengers(passengers)
    ,"randCode":""
    ,"purpose_codes": ticketInfoForPassengerForm.purpose_codes
    ,"key_check_isChange": ticketInfoForPassengerForm.key_check_isChange
    ,"leftTicketStr": ticketInfoForPassengerForm.leftTicketStr
    ,"train_location": ticketInfoForPassengerForm.train_location
    ,"choose_seats": ""
    ,"seatDetailType": "000"
    ,"whatsSelect": 1
    ,"roomType": "00"
    ,"dwAll": "N"
    ,"_json_att": ""
    ,"REPEAT_SUBMIT_TOKEN": token
  };

  var options = {
    url: url
    ,method: "POST"
    ,headers: Object.assign(Object.assign({}, headers), {
      "Referer": "https://kyfw.12306.cn/otn/confirmPassenger/initDc"
    })
    ,form: data
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;

      if(response.statusCode === 200) {
        if((response.headers["content-type"] || response.headers["Content-Type"]).indexOf("application/json") > -1) {
          return resolve(JSON.parse(body));
        }
      }

      reject(response.statusMessage);
    })
  })
}


function queryOrderWaitTime(token) {
  var url = "https://kyfw.12306.cn/otn/confirmPassenger/queryOrderWaitTime";
  var options = {
    url: url
    ,method: "POST"
    ,headers: Object.assign(Object.assign({}, headers), {
      "Referer": "https://kyfw.12306.cn/otn/confirmPassenger/initDc"
    })
    ,form: {
      "random": new Date().getTime()
      ,"tourFlag": "dc"
      ,"_json_att": ""
      ,"REPEAT_SUBMIT_TOKEN": token
    }
    ,json: true
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;

      if(response.statusCode === 200) {
        if((response.headers["content-type"] || response.headers["Content-Type"]).indexOf("application/json") > -1) {
          return resolve(body);
        }
        if(isSystemBussy(body)) {
          return reject(SYSTEM_BUSSY);
        }
        return reject(body);
      }
      reject(response.statusMessage);
    });
  });
}

function cancelQueueNoCompleteOrder() {
  var url = "https://kyfw.12306.cn/otn/queryOrder/cancelQueueNoCompleteMyOrder";
  var data = {
    tourFlag: "dc"
  };
  var options = {
    url: url
    ,method: "POST"
    ,headers: Object.assign(Object.assign({}, headers), {
      "Referer": "https://kyfw.12306.cn/otn/confirmPassenger/initDc"
    })
    ,form: data
    ,json: true
  };

  return new Promise((resolve, reject)=> {
    req(options, (error, response, body)=> {
      if(error) throw error;
      if(response.statusCode === 200) {
        if((response.headers["content-type"] || response.headers["Content-Type"]).indexOf("application/json") > -1) {
          return resolve(body);
        }
        if(isSystemBussy(body)) {
          return reject(SYSTEM_BUSSY);
        }
        return reject(body);
      }
      reject(response.statusMessage);
    });
  });
}

// 查询火车余票
var subjectQuery = new Rx.Subject();
subjectQuery.subscribe(x => {
  // Step 9 查询余票第二步，Get
  queryLeftTicket().then(trainsData => {
    //console.log(trainsData);
    var trains = trainsData.result;

    console.log("查询到火车数量 "+trains.length);
    var planTrain;
    trains.forEach(function(train) {
      train = train.split("|");

      if(train[30] == "有" || (train[30] > 0 && train[30] != "无" && train[30] != "0")) {
        console.log(train[3]);
        if(PLAN_TRAINS.includes(train[3])) {
          planTrain = train;
        }
      }
    });

    if(planTrain) {
      sjSmOReqCheckUser.next(planTrain[0]);
    }

  }, err => {
    console.error(err);
    setTimeout(()=> {
      subjectQuery.next();
    }, 1500);

  });

});

sjSmOReqCheckUser.subscribe(train=> {
  // Step 10 验证登录，Post
  checkUser().then(()=>sjSmOReqSubmit.next(train), error => {
    console.error("Check user error " + error);
    sjSmOReqCheckUser.next(train);
  });
});

sjSmOReqSubmit.subscribe(train=>
  // Step 11 预提交订单，Post
  submitOrderRequest(train).then((x)=> {
    console.log("Submit Order Request success!")
    sjInitDc.next();
  }, error=> {
    console.error("SubmitOrderRequest error " + error);
    sjSmOReqSubmit.next(train);
  })
);

sjInitDc.subscribe(train=> {
  // Step 12 模拟跳转页面InitDc，Post
  confirmPassengerInitDc().then((orderRequest)=> {
    console.log("confirmPassenger Init Dc success! "+orderRequest.token);
    // console.log(orderRequest.ticketInfo);
    sjPassengers.next(orderRequest);
  }, error=> {
    if(error == SYSTEM_BUSSY) {
      console.log(error);
      sjInitDc.next();
    }else if(error == SYSTEM_MOVED) {
      console.log(error);
      sjInitDc.next();
    }else {
      console.error(error);
    }
  }).catch(error=> console.error(error));
});

sjPassengers.subscribe(orderRequest=> {
  // Step 13 常用联系人确定，Post
  getPassengers(orderRequest.token).then(passengers=> {
    orderRequest.passengers = passengers;
    sjCheckOrderInfo.next(orderRequest);
  }, error=> {
    console.error(error + " Retry get passengers");
    sjPassengers.next(orderRequest);
  })
  .catch(error=> console.error(error));
});

sjCheckOrderInfo.subscribe(orderRequest=> {
  // Step 14 购票人确定，Post
  checkOrderInfo(orderRequest.token, orderRequest.passengers.data.normal_passengers)
    .then(orderInfo=> {
      console.log(orderInfo);
      // Step 15 准备进入排队，Post
      getQueueCount(orderRequest.token, orderRequest.orderRequest, orderRequest.ticketInfo)
        .then(x=> {
          console.log(x);
          // 若 Step 14 中的 "ifShowPassCode" = "Y"，那么多了输入验证码这一步，Post
          if(orderInfo.data.ifShowPassCode == "Y") {
            // Step 16 乘客买票验证码，Get POST
            getPassCodeNew().then(checkRandCodeAnsyn)
              .then(x=> {
                console.log(x);
                sjCfSingleForQueue.next(orderRequest);
              },error=>console.error(error));
          }else {
            // Step 17 确认购买，Post
            sjCfSingleForQueue.next(orderRequest);
          }
        }, error=> {
          console.error(error);
      });
    }, error=> {
      console.error(error);
      sjCheckOrderInfo.next(orderRequest);
  });
});

sjCfSingleForQueue.subscribe(orderRequest=> {
  confirmSingleForQueue(orderRequest.token, orderRequest.passengers.data.normal_passengers, orderRequest.ticketInfo)
    .then(x=>{
      console.log(x);

      // Step 18 查询排队等待时间！
      sjQueryOrderWaitTime.next(orderRequest);

    },error=> {
      console.error(error);
      sjCfSingleForQueue.next(orderRequest);
  });
});

// 每隔 4 秒循环查询排队等待时间！ Post
var sjQueryOrderWaitTime = new Rx.Subject();
sjQueryOrderWaitTime.subscribe(orderRequest=> {
  queryOrderWaitTime(orderRequest.token)
    .then(orderQueue=> {
      if(orderQueue.status) {
        if(orderQueue.data.waitTime === 0 || orderQueue.data.waitTime === -1) {
          console.log(chalk`Your ticket order number is {red.bold ${orderQueue.data.orderId}}`);
        }else if(orderQueue.data.waitTime === -2){
          console.log(orderQueue);
        }else if(orderQueue.data.waitTime === -3){
          console.log("Your ticket request has been canceled!");
        }else if(orderQueue.data.waitTime === -4){
          console.log("Your ticket request is being processed, please wait a moment!");
          setTimeout(x=> {
            sjQueryOrderWaitTime.next(orderRequest);
          }, 4000);
        }else {
          console.log(orderQueue);
        }
      }else {
        console.log(orderQueue);
        setTimeout(x=> {
          sjQueryOrderWaitTime.next(orderRequest);
        }, 4000);
      }
    }, error=> {
      console.log(chalk.bgBlue(error+" ReCheck Order waiting time"));
      setTimeout(x=> {
        sjQueryOrderWaitTime.next(orderRequest);
      }, 4000);
    });
});

// 执行抢票
// Step 1-7 登录
login()
//   .then(x=> cancelQueueNoCompleteOrder().then(x=>console.log(x), error=>console.error(error)))
//  .then(x=> sjQueryOrderWaitTime.next({token: ""}))
  //Step 8 初始化查询余票页面，POST
  .then(leftTicketInit)
  .then(()=> {
    // 查询余票
    subjectQuery.next();
  }, error=> {
    console.error(error);
  })
  .catch(error=> {
    console.error(error);
  });
