
module.exports = function getPassengers() {
  var url = "https://kyfw.12306.cn/otn/confirmPassenger/getPassengerDTOs";

  var myHeaders = Object.assign({}, headers);
  myHeaders = Object.assign(myHeaders, {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    ,"Cookie": "JSESSIONID=913D6088A0465098BD60C1AD8ADE0A98; tk=CjnCaQkHmP-fv_aLZRge9X5KXkg4mM87bUx9PBa5M-Ufsa1a0; route=495c805987d0f5c8c84b14f60212447d; BIGipServerotn=1490616586.50210.0000; BIGipServerpassport=887619850.50215.0000; RAIL_EXPIRATION=1516888514432; RAIL_DEVICEID=BUDllF83rIg8WbCrkztInw4nMU-21NIjmLDk5wS_lbQ1RlQwbORtlKtfFAGXHfv7VVlz6s6m38DnkcJIHmkaz4dh4OIM-ybyZ4cQpBZtDosbFu53hl8WWH-iYIvo3HsNIZfkS0qpfQMVgf9Zy1h-ytrTfozna-B4; current_captcha_type=Z; _jc_save_wfdc_flag=dc; _jc_save_fromStation=%u4E0A%u6D77%2CSHH; _jc_save_toStation=%u5F90%u5DDE%u4E1C%2CUUH; _jc_save_showIns=true; acw_tc=AQAAAJaiRTFGTQcAWSxrcbmdQsQieRp9; _jc_save_toDate=2018-01-25; _jc_save_fromDate=2018-01-27"
    ,"Referer": "https://kyfw.12306.cn/otn/confirmPassenger/initDc"
  });

  var data = {
    "_json_att": ""
    ,"REPEAT_SUBMIT_TOKEN": "f11482ceb95fe169b81666d1703fb1fb"
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
