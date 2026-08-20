// Original Script Made by Costache Madalin (lllll llll)
// Discord: costache madalin#8472
// Original Script Link: https://forum.tribalwars.net/index.php?threads/support-sender.286798/
//
// Custom Version by Vanquished -> v1.0 | 2026-07-11
//
// Self-contained, no longer pulls data from external sources. All in-game.
// + Defensive-plan import: paste a per-player defensive support plan.
//
// ################# Disclaimer #################
// By uploading a user-generated mod for use with Tribal Wars, the creator grants
// InnoGames a perpetual, irrevocable, worldwide, royalty-free, non-exclusive license
// to use, reproduce, distribute, publicly display, modify, and create derivative
// works of the mod. This license permits InnoGames to incorporate the mod into any
// aspect of the game and its related services, including promotional and commercial
// endeavors, without any requirement for compensation or attribution to the uploader.
// The uploader represents and warrants that they have the legal right to grant this
// license and that the mod does not infringe upon any third-party rights. German law applies.
//

var heavyCav=4

// Wrong screen: alert + redirect. ssRightScreen gates main() so nothing below
// touches the missing DOM while the redirect loads. The params are checked
// separately — the game inserts others between them (order, dir, target, group).
var ssRightScreen = window.location.href.includes("screen=place") && window.location.href.includes("mode=call")
if(!ssRightScreen)
{
    alert("this script must be run from Rally point-> Mass support");
    window.location.href=game_data.link_base_pure+"place&mode=call"
}

var units = game_data.units.filter(u => u != "snob" && u != "militia" && u != "knight")

function httpGet(theUrl)
{
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", theUrl, false ); // synchronous — getSpeedConstant needs the result inline
    xmlHttp.send( null );
    return xmlHttp.responseText;
}

var defaultTheme= '[["theme1",["#E0E0E0","#000000","#C5979D","#2B193D","#2C365E","#484D6D","#4B8F8C","50"]],["currentTheme","theme1"],["theme2",["#E0E0E0","#000000","#F76F8E","#113537","#37505C","#445552","#294D4A","50"]],["theme3",["#E0E0E0","#000000","#ACFCD9","#190933","#665687","#7C77B9","#623B5A","50"]],["theme4",["#E0E0E0","#000000","#181F1C","#60712F","#274029","#315C2B","#214F4B","50"]],["theme5",["#E0E0E0","#000000","#9AD1D4","#007EA7","#003249","#1F5673","#1C448E","50"]],["theme6",["#E0E0E0","#000000","#EA8C55","#81171B","#540804","#710627","#9E1946","50"]],["theme7",["#E0E0E0","#000000","#754043","#37423D","#171614","#3A2618","#523A34","50"]],["theme8",["#E0E0E0","#000000","#9E0031","#8E0045","#44001A","#600047","#770058","50"]],["theme9",["#E0E0E0","#000000","#C1BDB3","#5F5B6B","#323031","#3D3B3C","#575366","50"]],["theme10",["#E0E0E0","#000000","#E6BCCD","#29274C","#012A36","#14453D","#7E52A0","50"]]]'
var localStorageThemeName = "supportSenderTheme"
// migrate themes stored before widthInterface joined the colour list (7 → 8 entries)
if(localStorage.getItem(localStorageThemeName)!=undefined){
    let mapTheme = new Map(JSON.parse(localStorage.getItem(localStorageThemeName)))
    Array.from(mapTheme.keys()).forEach((key)=>{
        if(key!="currentTheme"){
            let listColors=mapTheme.get(key);
            if(listColors.length == 7){
                listColors.push(50);
                mapTheme.set(key,listColors)
            }
        }
    })
    localStorage.setItem(localStorageThemeName, JSON.stringify(Array.from(mapTheme.entries())))
}

var textColor="#ffffff"
var backgroundInput="#000000"

var borderColor = "#C5979D"
var backgroundContainer="#2B193D"
var backgroundHeader="#2C365E"
var backgroundMainTable="#484D6D"
var backgroundInnerTable="#4B8F8C"

var widthInterface=50;//percentage
var headerColorDarken=-50 //percentage; -(darker) +(lighter)
var headerColorAlternateTable=-30;
var headerColorAlternateHover=30;

function main(){
    initializationTheme()
    addCssStyle()
    createMainInterface()
    changeTheme()
    addEvents()
    ssRestorePlan()
    ssRenderPlanStatus()
    ssResolveTargetIds() // fill any village IDs still missing from the cache
}

function getColorDarker(hexInput, percent) {
    let hex = hexInput.replace(/^\s*#|\s*$/g, "");

    // convert 3 char codes --> 6, e.g. `E0F` --> `EE00FF`
    if (hex.length === 3) {
        hex = hex.replace(/(.)/g, "$1$1");
    }

    let r = parseInt(hex.substr(0, 2), 16);
    let g = parseInt(hex.substr(2, 2), 16);
    let b = parseInt(hex.substr(4, 2), 16);

    const calculatedPercent = (100 + percent) / 100;

    r = Math.round(Math.min(255, Math.max(0, r * calculatedPercent)));
    g = Math.round(Math.min(255, Math.max(0, g * calculatedPercent)));
    b = Math.round(Math.min(255, Math.max(0, b * calculatedPercent)));

    return `#${("00"+r.toString(16)).slice(-2).toUpperCase()}${("00"+g.toString(16)).slice(-2).toUpperCase()}${("00"+b.toString(16)).slice(-2).toUpperCase()}`
}

function invertColor(hex) {
    if (hex.indexOf('#') === 0) {
        hex = hex.slice(1);
    }
    // convert 3-digit hex to 6-digits.
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length !== 6) {
        throw new Error('Invalid HEX color.');
    }
    var r = (255 - parseInt(hex.slice(0, 2), 16)).toString(16),
        g = (255 - parseInt(hex.slice(2, 4), 16)).toString(16),
        b = (255 - parseInt(hex.slice(4, 6), 16)).toString(16);
    return '#' + padZero(r) + padZero(g) + padZero(b);
}

function padZero(str, len) {
    len = len || 2;
    var zeros = new Array(len).join('0');
    return (zeros + str).slice(-len);
}

function addCssStyle(){
    let cssStyle =`
    .scriptContainer{
        width: ${widthInterface}%;
        background: ${backgroundContainer};
        cursor:move;
        z-index:50;
        border-radius: 15px;

        border-style: solid;
        border-width: 5px 5px;
        border-color:${backgroundHeader};

    }
    .scriptHeader{
        color: ${textColor};
        background: ${backgroundHeader};
        width: 100%;
        margin: 0 auto;
        display: flex;
        justify-content: center;
        align-items: center;
    }
    .scriptFooter{
        color: ${textColor};
        background: ${backgroundHeader};
        width: 100%;
        margin: 0 auto;
        display: flex;
        justify-content: right;
        align-items: center;
        margin-right:50px;
    }


    .scriptTable{
        position: relative;
        width: 95%;
        border-collapse: collapse;
        table-layout: fixed;
        margin: 0 auto;
        margin-top:20px;
        margin-bottom:20px;

    }
    .scriptTable td{
        width: auto;
        overflow: hidden;
        text-overflow: ellipsis;
        border-style: solid;
        border-width: 1px 1px;
        border-color: ${borderColor};
        padding:10px;
        text-align: center;
        color: ${textColor};
        word-wrap: break-word;

    }
    .scriptTable tr:nth-child(odd){
        background: ${getColorDarker(backgroundMainTable,headerColorAlternateTable)};
    }
    .scriptTable tr:nth-child(even){
        background: ${backgroundMainTable};
    }

    .scriptTable tr:first-child{
        width: auto;
        border-style: solid;
        border-width: 1px 1px;
        border-color: ${borderColor};
        padding:15px;
        text-align: center;
        color: ${textColor};
        background: ${getColorDarker(backgroundMainTable,headerColorDarken)};
    }
    .scriptTable tr:not(:first-child):hover {
        background-color: ${getColorDarker(backgroundMainTable,headerColorAlternateHover)};
    }


    .scriptInput {
        width:50%;
        font-size: 15px;
        background-color : ${backgroundInput};
        border-radius: 10px;
        color:${textColor};
        text-align: center;

    }
    input[type="text"]:disabled {
        background: ${getColorDarker(invertColor(textColor),50)};
        text-align: center;
    }
    select {
        background: ${backgroundInput};
        color: ${textColor};
        border-radius: 5px;
        width:50%;
        text-align:center;
        font-size:15px;
    }
    `
    let style = document.createElement('style');
    style.textContent = cssStyle;
    document.head.appendChild(style);
}

function createMainInterface(){
    let hasArcher = game_data.units.includes("archer")
    let rowsSpawnButtons = hasArcher ? 7 : 6;
    let rowsSpawnDatetimes = hasArcher ? 4 : 3;
    // the units the mass-support form deals in: the world's defensive units + spy
    let fmUnits = units.filter(u => !["axe","light","ram","catapult","marcher"].includes(u))

    let html=`
    <div id="div_container" class="scriptContainer">
        <div class="scriptHeader">
            <div style=" margin-top:10px;"><h2>Support sender</h2></div>
            <div style="position:absolute;top:10px;right: 10px;"><a href="#" onclick="$('#div_container').remove()" style="font-size:18px;text-decoration:none;">❌</a></div>
            <div style="position:absolute;top:10px;right: 35px;" id="div_minimize"><a href="#" style="font-size:18px;text-decoration:none;">➖</a></div>
            <div style="position:absolute;top:10px;right: 60px;" id="div_theme"><a href="#" onclick="$('#theme_settings').toggle()" style="font-size:18px;text-decoration:none;">🎨</a></div>
        </div>

        <div id="theme_settings"></div>

        <div id="div_body">
            <table id="table_upload" class="scriptTable">
                <tr>
                    <td>troops</td>
                    ${fmUnits.map(u=>`<td class="fm_unit"><img src="/graphic/unit/unit_${u}.webp"></td>`).join("")}
                    <td>pop</td>
                </tr>
                <tr id="totalTroops">
                    <td>total</td>
                    ${fmUnits.map(u=>`
                    <td>
                        <input id="${u}total" value="0" type="text" class="totalTroops scriptInput" disabled>
                        <font color="${textColor}" class="hideMobile">k</font>
                    </td>`).join("")}
                    <td>
                        <input id="packets_total" value="0" type="text" class="scriptInput" disabled>
                        <font color="${textColor}" class="hideMobile">k</font>
                    </td>
                </tr>
                <tr id="sendTroops">
                    <td>send</td>
                    ${fmUnits.map(u=>`
                    <td align="center">
                        <input id="${u}send" value="0" type="number" class="scriptInput sendTroops">
                        <font color="${textColor}" class="hideMobile">k</font>
                    </td>`).join("")}
                    <td align="center">
                        <input id="packets_send" value="0" type="number" class="scriptInput">
                        <font color="${textColor}" class="hideMobile">k</font>
                    </td>
                </tr>
                <tr id="reserveTroops">
                    <td>reserve</td>
                    ${fmUnits.map(u=>`
                    <td align="center">
                        <input id="${u}Reserve" value="0" type="number" class="scriptInput reserveTroops">
                        <font color="${textColor}" class="hideMobile">k</font>
                    </td>`).join("")}
                    <td align="center">
                        <input id="packets_reserve" value="0" type="text" class="scriptInput" disabled>
                        <font color="${textColor}" class="hideMobile">k</font>
                    </td>
                </tr>
                <tr>
                    <td colspan="1">
                        <center><font color="${textColor}"> sigil:</font><input type="number" id="flag_boost" class="scriptInput" min="0" max="100" placeholder="0" value="0" style="text-align: center"></center>
                    </td>
                    <td colspan="2">
                        <center><input type="checkbox" id="checkbox_window" value="land_specific"><font color="${textColor}"> packets land between:</font> </center>
                    </td>
                    <td colspan="${rowsSpawnDatetimes}">
                        <center style="margin:5px">start:<input type="datetime-local" id="start_window" style="text-align:center;" ></center>
                        <center style="margin:5px">end:  <input type="datetime-local" id="stop_window" style="text-align:center;" ></center>

                    </td>
                </tr>
                <tr>
                    <td colspan='${rowsSpawnButtons}'>
                        <button type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="fillInputs()">Fill inputs</button>
                        <button type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="countTotalTroops()">Calculate</button>
                    </td>

                </tr>
            </table>
            <table id="table_plan" class="scriptTable">
                <tr>
                    <td colspan="3">Defensive plan (tribe-calculator)</td>
                </tr>
                <tr>
                    <td colspan="3">
                        <textarea id="ss_plan_text" rows="4" placeholder="paste your SUPPORTPLAN export here" style="width:95%;background-color:${backgroundInput};color:${textColor};border-radius:10px;resize:vertical;"></textarea>
                    </td>
                </tr>
                <tr>
                    <td colspan="3">
                        <button type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="ssLoadPlanClick()">Load plan</button>
                        <button type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="ssFillCurrentTarget()">Fill current target</button>
                        <button type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="ssClearPlanClick()">Clear plan</button>
                    </td>
                </tr>
                <tr>
                    <td colspan="3" style="text-align:left;"><div id="ss_plan_status"></div></td>
                </tr>
            </table>
        </div>
        <div class="scriptFooter">
            <div style=" margin-top:5px;"><h5>made by Costache</h5></div>
        </div>
    </div>`

    $("#div_container").remove()
    $("#contentContainer").eq(0).prepend(html);
    $("#mobileContent").eq(0).prepend(html); // mobile layout has its own content root

    $("#div_container").css("position","fixed");
    $("#div_container").draggable();

    $("#div_minimize").on("click",()=>{
        let currentWidthPercentage=Math.ceil($('#div_container').width() / $('body').width() * 100);
        if(currentWidthPercentage >=widthInterface ){
            $('#div_container').css({'width' : '10%'});
            $('#div_body').hide();
        }
        else{
            $('#div_container').css({'width' : `${widthInterface}%`});
            $('#div_body').show();
        }
    })

    const settingsKey = game_data.world+"support_sender_settings2"
    const savedSettings = localStorage.getItem(settingsKey)
    if(savedSettings != null){
        const [list_checkbox, list_input] = JSON.parse(savedSettings)
        $('#table_upload input[type=checkbox]').each(function (index) {
            this.checked=list_checkbox[index]
        });
        $('#table_upload input').each(function (index) {
            this.value=list_input[index]
        });
        // totals are stale from the last session — recalculated on demand
        $('.totalTroops').each(function () {
            this.value=0
        });
        $("#packets_total").val(0)
    }
    $("#table_upload input[type=checkbox], #table_upload input").on("click input change",()=>{
        countTotalTroops()
        let list_checkbox=[]
        let list_input=[]
        $('#table_upload input[type=checkbox]').each(function () {
            list_checkbox.push(this.checked)
        });
        $('#table_upload input').each(function () {
            list_input.push(this.value)
        });

        let data=JSON.stringify([list_checkbox,list_input])
        if(data!=localStorage.getItem(settingsKey)){
            localStorage.setItem(settingsKey,data)
        }
    })

    if(game_data.device !="desktop"){
        $(".hideMobile").hide()
        $("#table_upload").find("input[type=text]").css("width","100%")
    }
}

function changeTheme(){
    let html= `
    <h3 style="color:${textColor};padding-left:10px;padding-top:5px">after theme is selected run the script again<h3>
    <table class="scriptTable" >

        <tr>
            <td>
                <select  id="select_theme">
                    <option value="theme1">theme1</option>
                    <option value="theme2">theme2</option>
                    <option value="theme3">theme3</option>
                    <option value="theme4">theme4</option>
                    <option value="theme5">theme5</option>
                    <option value="theme6">theme6</option>
                    <option value="theme7">theme7</option>
                    <option value="theme8">theme8</option>
                    <option value="theme9">theme9</option>
                    <option value="theme10">theme10</option>
                </select>
            </td>
            <td>value</td>
            <td >color hex</td>
        </tr>
        <tr>
            <td>textColor</td>
            <td style="background-color:${textColor}" class="td_background"></td>
            <td><input type="text" class="scriptInput input_theme" value="${textColor}"></td>
        </tr>
        <tr>
            <td>backgroundInput</td>
            <td style="background-color:${backgroundInput}" class="td_background"></td>
            <td><input type="text" class="scriptInput input_theme" value="${backgroundInput}"></td>
        </tr>
        <tr>
            <td>borderColor</td>
            <td style="background-color:${borderColor}" class="td_background"></td>
            <td><input type="text" class="scriptInput input_theme" value="${borderColor}"></td>
        </tr>
        <tr>
            <td>backgroundContainer</td>
            <td style="background-color:${backgroundContainer}" class="td_background"></td>
            <td><input type="text" class="scriptInput input_theme" value="${backgroundContainer}"></td>
        </tr>
        <tr>
            <td>backgroundHeader</td>
            <td style="background-color:${backgroundHeader}" class="td_background"></td>
            <td><input type="text" class="scriptInput input_theme" value="${backgroundHeader}"></td>
        </tr>
        <tr>
            <td>backgroundMainTable</td>
            <td style="background-color:${backgroundMainTable}" class="td_background"></td>
            <td><input type="text" class="scriptInput input_theme" value="${backgroundMainTable}"></td>
        </tr>
        <tr>
            <td>backgroundInnerTable</td>
            <td style="background-color:${backgroundInnerTable}" class="td_background"></td>
            <td><input type="text" class="scriptInput input_theme" value="${backgroundInnerTable}"></td>
        </tr>
        <tr>
            <td>widthInterface</td>
            <td><input type="range" min="25" max="100" class="slider input_theme" id="input_slider_width" value="${widthInterface}"></td>
            <td id="td_width">${widthInterface}%</td>
        </tr>
        <tr >
            <td><input class="btn evt-confirm-btn btn-confirm-yes" type="button" id="btn_save_theme" value="Save"></td>
            <td><input class="btn evt-confirm-btn btn-confirm-yes" type="button" id="btn_reset_theme" value="Default themes"></td>
            <td></td>
        </tr>

    </table>
    `
    $("#theme_settings").append(html)
    $("#theme_settings").hide()

    let selectedTheme = ""
    let colours =[]
    let mapTheme = new Map()

    $("#select_theme").on("change",()=>{
        if(localStorage.getItem(localStorageThemeName) != undefined){
            selectedTheme = $('#select_theme').find(":selected").text();
            mapTheme = new Map(JSON.parse(localStorage.getItem(localStorageThemeName)))
            colours = mapTheme.get(selectedTheme)
            Array.from($(".input_theme")).forEach((elem,index)=>{
                elem.value = colours[index]
            })
            Array.from($(".td_background")).forEach((elem,index)=>{
                elem.style.background = colours[index]
            })

            mapTheme.set("currentTheme",selectedTheme)
            localStorage.setItem(localStorageThemeName, JSON.stringify(Array.from(mapTheme.entries())))
        }
    })

    $("#btn_save_theme").on("click",()=>{
        colours = Array.from($(".input_theme")).map(elem=>elem.value.toUpperCase().trim())
        selectedTheme = $('#select_theme').find(":selected").text();

        for(let i=0;i<colours.length-1;i++){
            if(colours[i].match(/#[0-9 A-F]{6}/) == null ){
                UI.ErrorMessage("wrong colour: "+colours[i])
                throw new Error("wrong colour")
            }
        }

        if(localStorage.getItem(localStorageThemeName) != undefined)
            mapTheme = new Map(JSON.parse(localStorage.getItem(localStorageThemeName)))

        mapTheme.set(selectedTheme,colours)
        mapTheme.set("currentTheme",selectedTheme)

        localStorage.setItem(localStorageThemeName, JSON.stringify(Array.from(mapTheme.entries())))
        UI.SuccessMessage(`saved colours for: ${selectedTheme} \n run the script again`,1000)
    })

    $("#btn_reset_theme").on("click",()=>{
        localStorage.setItem(localStorageThemeName, defaultTheme)
        UI.SuccessMessage("run the script again",1000)
    })

    $("#input_slider_width").on("input",()=>{
        $("#td_width").text($("#input_slider_width").val()+"%")
    })

    if(localStorage.getItem(localStorageThemeName) != undefined){
        mapTheme = new Map(JSON.parse(localStorage.getItem(localStorageThemeName)))
        document.querySelector('#select_theme').value=mapTheme.get("currentTheme")
    }
}

function initializationTheme(){
    if(localStorage.getItem(localStorageThemeName) == undefined){
        localStorage.setItem(localStorageThemeName, defaultTheme)
    }

    let mapTheme = new Map(JSON.parse(localStorage.getItem(localStorageThemeName)))
    let colours = mapTheme.get(mapTheme.get("currentTheme"))

    textColor=colours[0]
    backgroundInput=colours[1]
    borderColor = colours[2]
    backgroundContainer=colours[3]
    backgroundHeader=colours[4]
    backgroundMainTable=colours[5]
    backgroundInnerTable=colours[6]
    widthInterface=colours[7]

    if(game_data.device != "desktop"){
        widthInterface = 98
    }
}


function countTotalTroops(){
    // no land window checked → accept everything (±1 year around now)
    let dateStart = new Date()
    let dateStop = new Date()
    dateStart.setFullYear(dateStart.getFullYear()-1)
    dateStop.setFullYear(dateStop.getFullYear()+1)

    let sigil = 0;
    let timeWindow = document.getElementById("checkbox_window").checked
    if(timeWindow){
        dateStart = new Date(document.getElementById("start_window").value)
        dateStop = new Date(document.getElementById("stop_window").value)
        sigil = parseInt(document.getElementById("flag_boost").value)

        if(dateStart == "Invalid Date")
            UI.ErrorMessage("start date has an invalid format",2000)
        if(dateStop == "Invalid Date")
            UI.ErrorMessage("stop date has an invalid format",2000)

        sigil = Number.isNaN(sigil) ? 0 : sigil;
    }

    let coordDestination = ssCurrentTargetCoord()
    let sc = getSpeedConstant()
    let msPerField = 1000 / (sc.worldSpeed * sc.unitSpeed)
    let speedTroop = {
        snob: 2100 * msPerField,
        ram: 1800 * msPerField,
        catapult: 1800 * msPerField,
        sword: 1320 * msPerField,
        axe: 1080 * msPerField,
        spear: 1080 * msPerField,
        archer: 1080 * msPerField,
        heavy: 660 * msPerField,
        light: 600 * msPerField,
        marcher: 600 * msPerField,
        knight: 600 * msPerField,
        spy: 540 * msPerField
    }
    let nowMs = ssServerNowMs()

    let mapVillages = new Map()
    Array.from($("#village_troup_list tbody tr")).forEach(row => {
        let coord = row.children[0].innerText.match(/\d+\|\d+/)[0]
        let distance = calcDistance(coord, coordDestination)
        let objTroops = {
            distance: distance
        }

        units.forEach(troopName => {
            let totalTroops = parseInt($(row).find(`[data-unit='${troopName}']`).text())
            let reserveTroops = parseFloat($(`#${troopName}Reserve`).val())

            reserveTroops = (reserveTroops == undefined || Number.isNaN(reserveTroops)) ? 0 : reserveTroops*1000
            totalTroops = (totalTroops > reserveTroops) ? totalTroops - reserveTroops : 0

            let arriveMs = nowMs + speedTroop[troopName] * distance / (1 + sigil / 100.0)
            if(totalTroops > 0 && dateStart.getTime() < arriveMs && arriveMs < dateStop.getTime()){
                objTroops[troopName+"_speed"] = troopName
            }
            objTroops[troopName] = totalTroops
        })
        if(!timeWindow){
            delete objTroops.ram
            delete objTroops.catapult
            delete objTroops.ram_speed
            delete objTroops.catapult_speed
        }
        mapVillages.set(coord, objTroops)
    })

    // what a village contributes depends on its slowest unit still in the window:
    // rams/cats/swords bring everything, spears/archers everything but swords,
    // heavies only heavies+spies, spies only spies
    let objTroopsTotal = {
        spear: 0,
        sword: 0,
        archer: 0,
        spy: 0,
        heavy: 0
    }
    mapVillages.forEach(obj => {
        let tier = (obj.ram_speed != undefined || obj.catapult_speed != undefined || obj.sword_speed != undefined) ? 3
                 : (obj.spear_speed != undefined || obj.archer_speed != undefined) ? 2
                 : (obj.heavy_speed != undefined) ? 1
                 : (obj.spy_speed != undefined) ? 0 : -1
        if(tier < 0) return
        objTroopsTotal.spy += obj.spy
        if(tier >= 1) objTroopsTotal.heavy += obj.heavy
        if(tier >= 2){
            objTroopsTotal.spear += obj.spear
            if(obj.archer != undefined)
                objTroopsTotal.archer += obj.archer
        }
        if(tier >= 3) objTroopsTotal.sword += obj.sword
    })

    if(!game_data.units.includes("archer"))
        delete objTroopsTotal.archer

    let totalPop = 0;
    Object.keys(objTroopsTotal).forEach(key=>{
        if(units.includes(key)){
            document.getElementById(key+"total").value=(objTroopsTotal[key]/1000).toFixed(2)
        }
        if(key=="spear" || key=="sword" || key=="archer"){
            totalPop+=objTroopsTotal[key]
        }
        else if(key =='heavy')
            totalPop+=objTroopsTotal[key]*heavyCav;
    })

    document.getElementById("packets_total").value=(totalPop/1000).toFixed(2)
    addEvents()
    return mapVillages;
}

function fillInputs(){
    let mapVillages = countTotalTroops()

    let troopsTotal = Array.from(document.getElementsByClassName("totalTroops")).map(e=>parseFloat(e.value) * 1000)
    let sendTotal = Array.from(document.getElementsByClassName("sendTroops")).map(e => ({
        value: (Number.isNaN(parseFloat(e.value) * 1000) ? 0 : parseFloat(e.value) * 1000),
        troopName: e.id.replace("send", "")
    }))
    let sendTotalObj = {}
    sendTotal.forEach(e=>{
        sendTotalObj[e.troopName] = e.value
    })

    for(let i=0;i<troopsTotal.length;i++){
        if(troopsTotal[i] < sendTotal[i].value){
            alert("wrong input\n not enough troops");
            return;
        }
    }

    // tick exactly the support units in the game's own filter row, select every
    // village, zero the visible inputs, then type the computed counts below
    let supportUnits = ["spear", "sword", "archer", "spy", "heavy", "ram", "catapult"]
    let checkbox=document.getElementById("village_troup_list").children[0].children[0].getElementsByTagName("input");
    for(let i=0;i<checkbox.length-1;i++){
        checkbox[i].checked = supportUnits.includes(checkbox[i].id.split("_")[1]);
    }
    document.getElementById("place_call_select_all").click()
    $("#village_troup_list").find("input[type=number]:visible").val(0)

    // per village: the slowest unit still inside the land window sets the pace,
    // anything slower stays home; 1 ram/cat rides along purely as the pace-setter
    let listTotal = []
    Array.from(mapVillages.keys()).forEach(key=>{
        let obj = mapVillages.get(key)
        let objTotal ={
            coord: key
        }
        let speed = ["ram","catapult","sword","spear","archer","heavy","spy"].find(u => obj[u+"_speed"] != undefined)
        if(speed != undefined){
            let stayHome = {
                ram: [], catapult: [], sword: [],
                spear: ["sword"], archer: ["sword"],
                heavy: ["sword","spear"], spy: ["sword","spear","heavy"]
            }[speed]
            let gate = u => (stayHome.includes(u) || !(sendTotalObj[u] > 0)) ? 0 : obj[u]

            objTotal.speedTroop = speed
            objTotal.ram = (speed == "ram") ? 1 : 0
            objTotal.catapult = (speed == "catapult") ? 1 : 0
            objTotal.sword = gate("sword")
            objTotal.spear = gate("spear")
            objTotal.heavy = gate("heavy")
            objTotal.spy = (speed == "heavy") ? obj.spy : gate("spy") // heavy-paced sends always take the spies along
            if(obj.archer != undefined)
                objTotal.archer = (speed == "heavy" || speed == "spy") ? 0 : gate("archer")
        }
        objTotal.axe = 0
        objTotal.light = 0
        if(obj.marcher != undefined)
            objTotal.marcher = 0

        listTotal.push(objTotal)
    })

    let listTotalRange = listTotal.filter(row => row.speedTroop != undefined)

    let factorTroopSent = {}
    sendTotal.forEach(elem => {
        factorTroopSent[elem.troopName] = elem.value/listTotalRange.length
    })

    let timeWindow = document.getElementById("checkbox_window").checked
    let mapResult = new Map()
    Object.keys(factorTroopSent).forEach(troopName=>{
        let factorValue = factorTroopSent[troopName]

        listTotalRange.sort((o1,o2)=>{
            return o1[troopName] > o2[troopName] ? 1 : o1[troopName] < o2[troopName] ? -1 : 0
        })

        for(let i=0;i<listTotalRange.length;i++){
            let troopValue = listTotalRange[i][troopName]

            if(troopValue < factorValue){
                // village can't cover its share — spread the shortfall over the rest
                let redistribute = factorValue - troopValue
                factorValue += redistribute/(listTotalRange.length-i-1)
                listTotalRange[i][troopName] = troopValue
            }
            else{
                let module = factorValue % parseInt(factorValue)

                if(listTotalRange[i][troopName] + 1 > factorValue){
                    let randomValue = (Math.random() < module) ? 1 : 0
                    listTotalRange[i][troopName] = parseInt(factorValue) + randomValue
                }
                else{
                    listTotalRange[i][troopName] = factorValue
                }
            }

            if(listTotalRange[i]["speedTroop"] == troopName && listTotalRange[i][troopName] == 0 && timeWindow == true){
                listTotalRange[i][troopName] = 1
            }
            if(timeWindow == false){
                listTotalRange[i]["ram"] = 0
                listTotalRange[i]["catapult"] = 0
            }

            mapResult.set(listTotalRange[i].coord, listTotalRange[i])
        }
    })

    Array.from($(".overview_table .selected")).forEach(row=>{
        let coord = row.children[0].innerText.match(/\d+\|\d+/).pop()
        if(mapResult.has(coord)){
            let obj = mapResult.get(coord)
            let totalTroopCount = 0
            Object.keys(obj).forEach(troopName=>{
                if(troopName != "speedTroop" && troopName != "coord")
                    totalTroopCount += obj[troopName]
            })

            if(totalTroopCount > 1){
                Object.keys(obj).forEach(troopName=>{
                    if(troopName != "speedTroop"){
                        $(row).find(`.call-unit-box-${troopName}`).val(obj[troopName])
                    }
                })
            }
        }
    })
}


function addEvents(){
    $('.sendTroops').on('input',function(){
        let sendTotal=document.getElementsByClassName("sendTroops")
        let totalPop=0;
        for(let i=0;i<sendTotal.length;i++){
            let id=sendTotal[i].id
            let value=(sendTotal[i].value=="")?0:sendTotal[i].value

            if(id.includes("spear") || id.includes("sword") || id.includes("archer")){
                totalPop+=parseFloat(value)*1000
            }
            if(id.includes("heavy")){
                totalPop+=parseFloat(value)*1000*heavyCav
            }
        }
        document.getElementById("packets_send").value=(totalPop/1000).toFixed(2)
    });

    $('#packets_send').on('input',function(){
        let needTroops=parseFloat(document.getElementById("packets_send").value)
        let totalPop =parseFloat(document.getElementById("packets_total").value)
        let sendTotal=document.getElementsByClassName("sendTroops")
        let totalTroops=document.getElementsByClassName("totalTroops")

        let ratio = needTroops/totalPop
        for(let i=0;i<totalTroops.length;i++){
            if(!sendTotal[i].id.includes("spy")){
                sendTotal[i].value= parseInt(parseFloat(totalTroops[i].value)*ratio*100)/100.0
            }
            else{
                sendTotal[i].value=0
            }
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Defensive-plan import per-player. Format is the following (semicolon-separated, first line is header):
// <target> and <source> are XXX|YYY coordinates, <units> are integers.
//
// SUPPORTPLAN;1;<world>;<player>;spear,sword,spy,heavy
// <target>;<source>;<spear>;<sword>;<spy>;<heavy>;<arriveMs epoch or empty>
//
// The player pastes their per-player export once; it is stored in local storage. On each
// mass-support target the script fills every planned order (clamped to what the
// village actually has) — the user reviews and presses the game's send button.
// ═══════════════════════════════════════════════════════════════════════════

function ssParsePlan(text){
    const lines = String(text||'').split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length)
    if(!lines.length) return {ok:false, error:'empty'}
    const h = lines[0].split(';')
    if(h[0] !== 'SUPPORTPLAN') return {ok:false, error:'header'}
    if(h[1] !== '1') return {ok:false, error:'version'}
    const world = (h[2]||'').trim(), player = (h[3]||'').trim()
    const unitCols = (h[4]||'').split(',').map(s=>s.trim()).filter(Boolean)
    if(!unitCols.length) return {ok:false, error:'units'}
    const coordRe = /^\d{1,3}\|\d{1,3}$/
    const orders = [], badLines = []
    for(let i=1;i<lines.length;i++){
        const p = lines[i].split(';')
        if(p.length < 2 + unitCols.length){ badLines.push(i+1); continue }
        const target = p[0].trim(), source = p[1].trim()
        if(!coordRe.test(target) || !coordRe.test(source)){ badLines.push(i+1); continue }
        const units = {}
        let badNum = false
        unitCols.forEach((u,k)=>{
            const n = parseInt(p[2+k], 10)
            if(Number.isNaN(n) || n < 0) badNum = true
            units[u] = (Number.isNaN(n) || n < 0) ? 0 : n
        })
        if(badNum){ badLines.push(i+1); continue }
        const arriveRaw = (p[2+unitCols.length]||'').trim()
        let arriveMs = arriveRaw === '' ? null : parseInt(arriveRaw, 10)
        if(arriveMs !== null && Number.isNaN(arriveMs)) arriveMs = null
        orders.push({target, source, units, arriveMs})
    }
    if(!orders.length) return {ok:false, error:'noorders'}
    return {ok:true, world, player, unitCols, orders, badLines}
}

// Unique targets in plan order: [{coord, orders, arriveMs (earliest non-null)}]
function ssPlanTargets(orders){
    const seen = new Map()
    for(const o of orders){
        let t = seen.get(o.target)
        if(!t) seen.set(o.target, t = {coord:o.target, orders:0, arriveMs:null})
        t.orders++
        if(o.arriveMs != null && (t.arriveMs == null || o.arriveMs < t.arriveMs)) t.arriveMs = o.arriveMs
    }
    return Array.from(seen.values())
}

// orders (ONE target) × page rows [{coord, avail:{unit:n}}] → what to type where.
// Clamps to the row's available count (NaN availability → trust the plan and let the
// game validate). Sources not on the page land in `missing`.
function ssComputeFill(orders, rows){
    const byCoord = {}
    rows.forEach(r=>{ byCoord[r.coord] = r })
    const fills = [], missing = [], clamped = []
    orders.forEach(o=>{
        const row = byCoord[o.source]
        if(!row){ missing.push(o.source); return }
        const units = {}
        let any = false
        Object.keys(o.units).forEach(u=>{
            const want = o.units[u]||0
            const have = row.avail && !Number.isNaN(row.avail[u]) && row.avail[u] != null ? row.avail[u] : want
            const got = Math.min(want, have)
            if(got < want) clamped.push({coord:o.source, unit:u, want, got})
            units[u] = got
            if(got > 0) any = true
        })
        if(any) fills.push({coord:o.source, units})
    })
    return {fills, missing, clamped}
}

// Slowest unit's ms-per-field among the units actually in the order (same base
// seconds the game uses; ws/us from getSpeedConstant()). null if the order is empty.
function ssSlowestMsPerField(units, ws, us){
    const base = {spy:540, light:600, marcher:600, knight:600, heavy:660, spear:1080, axe:1080, archer:1080, sword:1320, ram:1800, catapult:1800, snob:2100}
    let slowest = null
    Object.keys(units||{}).forEach(u=>{
        if((units[u]||0) > 0 && base[u] != null){
            const ms = base[u]*1000/(ws*us)
            if(slowest === null || ms > slowest) slowest = ms
        }
    })
    return slowest
}

// Earliest "send by" over a target's orders: min(arriveMs − travel). null without deadlines.
function ssTargetSendByMs(orders, ws, us){
    let sendBy = null
    for(const o of orders){
        if(o.arriveMs == null) continue
        const per = ssSlowestMsPerField(o.units, ws, us)
        if(per === null) continue
        const depart = o.arriveMs - per*calcDistance(o.source, o.target)
        if(sendBy === null || depart < sendBy) sendBy = depart
    }
    return sendBy
}

function ssEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

function ssFmtDT(ms){
    const d = new Date(ms)
    const p = n => (n<10?'0':'')+n
    return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// ── DOM side ──

var ssPlan = null // {raw, parsed, done:{coord:true}}

function ssPlanKey(){ return game_data.world + "support_sender_plan_v1" }

function ssServerNowMs(){
    let serverTime = document.getElementById("serverTime").innerText
    let serverDate = document.getElementById("serverDate").innerText.split("/")
    return new Date(serverDate[1]+"/"+serverDate[0]+"/"+serverDate[2]+" "+serverTime).getTime()
}

function ssCurrentTargetCoord(){
    try{
        if(game_data.device == "desktop"){
            const m = $(".village-name").text().match(/\d+\|\d+/)
            return m ? m[0] : null
        }
        const x = $("#inputx").val(), y = $("#inputy").val()
        return (x && y) ? x+"|"+y : null
    }catch(e){ return null }
}

function ssSavePlan(){
    if(ssPlan) localStorage.setItem(ssPlanKey(), JSON.stringify({raw:ssPlan.raw, done:ssPlan.done}))
    else localStorage.removeItem(ssPlanKey())
}

function ssRestorePlan(){
    const stored = localStorage.getItem(ssPlanKey())
    if(!stored) return
    try{
        const obj = JSON.parse(stored)
        const parsed = ssParsePlan(obj.raw)
        if(parsed.ok) ssPlan = {raw:obj.raw, parsed, done:obj.done||{}}
    }catch(e){ /* corrupt store — start empty */ }
}

function ssLoadPlanClick(){
    const text = document.getElementById("ss_plan_text").value
    const parsed = ssParsePlan(text)
    if(!parsed.ok){
        const why = {empty:"paste your SUPPORTPLAN export first", header:"not a SUPPORTPLAN export (bad header)",
                     version:"unsupported SUPPORTPLAN version", units:"bad unit column list", noorders:"no valid order lines"}[parsed.error]
        UI.ErrorMessage("plan not loaded: " + why, 3000)
        return
    }
    ssPlan = {raw:text, parsed, done:{}}
    ssSavePlan()
    document.getElementById("ss_plan_text").value = ""
    ssRenderPlanStatus()
    ssResolveTargetIds(true) // fresh plan → re-resolve every target's village ID
    UI.SuccessMessage(`plan loaded: ${parsed.orders.length} orders`, 2000)
}

function ssClearPlanClick(){
    if(ssPlan && !confirm("clear the stored support plan?")) return
    ssPlan = null
    ssSavePlan()
    ssRenderPlanStatus()
}

function ssToggleDone(coord){
    if(!ssPlan) return
    ssPlan.done[coord] = !ssPlan.done[coord]
    ssSavePlan()
    ssRenderPlanStatus()
}

// ── coord → village ID (the mass-call URL needs &target=<villageId>) ──
// Resolved from the game's OWN /map/village.txt (same origin), one fetch per plan,
// cached per world. Lines are "id,name(urlencoded),x,y,player,points,rank" — the
// urlencoded name can never contain a raw comma, so a plain split is safe.

function ssParseVillageTxt(text, wantedCoords){
    const wanted = new Set(wantedCoords)
    const map = {}
    let found = 0
    for(const line of String(text||'').split('\n')){
        if(found >= wanted.size) break
        const p = line.split(',')
        if(p.length < 4) continue
        const coord = p[2] + "|" + p[3]
        if(wanted.has(coord) && map[coord] == null){
            const id = parseInt(p[0], 10)
            if(!Number.isNaN(id)){ map[coord] = id; found++ }
        }
    }
    return map
}

var ssVillageIds = null // {coord: id}, lazy per-world cache

function ssVillageIdsKey(){ return game_data.world + "support_sender_village_ids_v1" }

function ssLoadVillageIds(){
    if(ssVillageIds) return
    try{ ssVillageIds = JSON.parse(localStorage.getItem(ssVillageIdsKey())) }
    catch(e){ ssVillageIds = null }
    if(!ssVillageIds || typeof ssVillageIds !== 'object') ssVillageIds = {}
}

// Fetch IDs for plan targets we don't know yet; re-renders the status when they land.
// force=true re-resolves ALL plan targets (fresh plan load — a rebuilt village on the
// same coord gets a new ID, so don't trust old cache entries for a new plan).
function ssResolveTargetIds(force){
    if(!ssPlan) return
    ssLoadVillageIds()
    const coords = ssPlanTargets(ssPlan.parsed.orders).map(t=>t.coord)
    const missing = force ? coords : coords.filter(c=>ssVillageIds[c] == null)
    if(!missing.length) return
    $.get("/map/village.txt", text=>{
        const map = ssParseVillageTxt(text, missing)
        if(Object.keys(map).length){
            Object.keys(map).forEach(c=>{ ssVillageIds[c] = map[c] })
            localStorage.setItem(ssVillageIdsKey(), JSON.stringify(ssVillageIds))
            ssRenderPlanStatus()
        }
    })
}

function ssMassCallUrl(coord){
    ssLoadVillageIds()
    const id = ssVillageIds[coord]
    return game_data.link_base_pure + "place&mode=call" + (id != null ? "&target=" + id : "")
}

// fillResult (optional): summary of the last ssFillCurrentTarget run for the banner line
function ssRenderPlanStatus(fillResult){
    const host = document.getElementById("ss_plan_status")
    if(!host) return
    if(!ssPlan){ host.innerHTML = `<i>no plan loaded — paste your SUPPORTPLAN export above</i>`; return }

    const p = ssPlan.parsed
    const current = ssCurrentTargetCoord()
    const targets = ssPlanTargets(p.orders)
    const doneCount = targets.filter(t=>ssPlan.done[t.coord]).length
    let sc = null, nowMs = null
    try{ sc = getSpeedConstant(); nowMs = ssServerNowMs() }catch(e){ /* speed/time unavailable — omit send-by */ }

    let html = `<div style="margin-bottom:6px;"><b>${ssEsc(p.player)}</b> @ ${ssEsc(p.world)} — ${p.orders.length} orders / ${targets.length} targets (${doneCount} done)</div>`
    if(p.world && game_data.world && p.world !== game_data.world)
        html += `<div style="color:#ff6b6b;margin-bottom:6px;">⚠ plan is for world <b>${ssEsc(p.world)}</b> but you are on <b>${ssEsc(game_data.world)}</b></div>`
    if(p.badLines && p.badLines.length)
        html += `<div style="color:#ffb347;margin-bottom:6px;">⚠ skipped unreadable lines: ${p.badLines.join(", ")}</div>`

    if(fillResult){
        html += `<div style="color:#7CFC00;margin-bottom:6px;">filled ${fillResult.applied}/${fillResult.orders} orders for ${ssEsc(fillResult.target)}`
        if(fillResult.missing.length) html += ` — <span style="color:#ffb347;">not in list: ${fillResult.missing.map(ssEsc).join(", ")}</span>`
        if(fillResult.clamped.length) html += ` — <span style="color:#ffb347;">short: ${fillResult.clamped.map(c=>`${ssEsc(c.coord)} ${ssEsc(c.unit)} ${c.got}/${c.want}`).join(", ")}</span>`
        if(fillResult.late.length) html += ` — <span style="color:#ff6b6b;">⚠ TOO LATE for: ${fillResult.late.map(ssEsc).join(", ")}</span>`
        html += `</div>`
    }

    html += targets.map(t=>{
        const isCur = t.coord === current
        const done = !!ssPlan.done[t.coord]
        const tOrders = p.orders.filter(o=>o.target === t.coord)
        const sendBy = sc && nowMs !== null ? ssTargetSendByMs(tOrders, sc.worldSpeed, sc.unitSpeed) : null
        let line = `<a href="#" onclick="ssToggleDone('${t.coord}');return false;" title="toggle done" style="text-decoration:none;">${done ? "✅" : "⬜"}</a> `
        line += `<a href="${ssMassCallUrl(t.coord)}" style="${done ? "opacity:0.5;" : ""}">${t.coord}</a> — ${t.orders} order${t.orders===1?"":"s"}`
        if(t.arriveMs != null) line += ` — arrive ${ssFmtDT(t.arriveMs)}`
        if(sendBy != null) line += ` — <span style="color:${nowMs > sendBy ? "#ff6b6b" : "#ffb347"};">send by ${ssFmtDT(sendBy)}</span>`
        if(isCur) line += ` <b style="color:#7CFC00;">◀ current</b>`
        return `<div style="margin:2px 0;${done ? "opacity:0.7;" : ""}">${line}</div>`
    }).join("")

    host.innerHTML = html
}

function ssFillCurrentTarget(){
    if(!ssPlan){ UI.ErrorMessage("no plan loaded", 2000); return }
    const target = ssCurrentTargetCoord()
    if(!target){ UI.ErrorMessage("could not detect the current target village", 3000); return }
    const orders = ssPlan.parsed.orders.filter(o=>o.target === target)
    if(!orders.length){ UI.ErrorMessage(`no planned support for ${target}`, 3000); return }

    // availability snapshot BEFORE touching checkboxes (unit cells per own-village row)
    const rows = Array.from($("#village_troup_list tbody tr")).map(row=>{
        const m = row.children[0].innerText.match(/\d+\|\d+/)
        if(!m) return null
        const avail = {}
        ssPlan.parsed.unitCols.forEach(u=>{
            avail[u] = parseInt($(row).find(`[data-unit='${u}']`).text())
        })
        return {coord:m[0], avail}
    }).filter(Boolean)

    const res = ssComputeFill(orders, rows)

    // enable exactly the plan's unit columns, select every village row, zero the inputs
    // (same mechanics as fillInputs above), then type the planned counts per source row
    let checkbox = document.getElementById("village_troup_list").children[0].children[0].getElementsByTagName("input")
    for(let i=0;i<checkbox.length-1;i++){
        let id = checkbox[i].id.split("_")[1]
        checkbox[i].checked = ssPlan.parsed.unitCols.includes(id)
    }
    document.getElementById("place_call_select_all").click()
    $("#village_troup_list").find("input[type=number]:visible").val(0)

    const fillByCoord = {}
    res.fills.forEach(f=>{ fillByCoord[f.coord] = f.units })
    let applied = 0
    Array.from($(".overview_table .selected")).forEach(row=>{
        const m = row.children[0].innerText.match(/\d+\|\d+/)
        const coord = m ? m.pop() : null
        if(coord && fillByCoord[coord]){
            Object.keys(fillByCoord[coord]).forEach(u=>{
                $(row).find(`.call-unit-box-${u}`).val(fillByCoord[coord][u])
            })
            applied++
        }
    })

    // deadline check: an order whose slowest unit can no longer arrive in time
    const late = []
    try{
        const sc = getSpeedConstant(), nowMs = ssServerNowMs()
        orders.forEach(o=>{
            if(o.arriveMs == null) return
            const per = ssSlowestMsPerField(o.units, sc.worldSpeed, sc.unitSpeed)
            if(per !== null && nowMs + per*calcDistance(o.source, o.target) > o.arriveMs) late.push(o.source)
        })
    }catch(e){ /* no speed/server time — skip the check */ }

    ssRenderPlanStatus({target, orders:orders.length, applied, missing:res.missing, clamped:res.clamped, late})
    if(applied > 0) UI.SuccessMessage(`filled ${applied}/${orders.length} orders — review and press the game's send button`, 3000)
    else UI.ErrorMessage("nothing filled — none of the planned source villages are in the list", 3000)
}

function calcDistance(coord1,coord2){
    let x1=parseInt(coord1.split("|")[0])
    let y1=parseInt(coord1.split("|")[1])
    let x2=parseInt(coord2.split("|")[0])
    let y2=parseInt(coord2.split("|")[1])

    return Math.sqrt( (x1-x2)*(x1-x2) +  (y1-y2)*(y1-y2) );
}

function getSpeedConstant() { // world speed × unit speed, fetched once and cached per world
    const key = game_data.world+"speedWorld"
    const cached = localStorage.getItem(key)
    if (cached !== null) return JSON.parse(cached)

    const data = httpGet("/interface.php?func=get_config")
    const htmlDoc = new DOMParser().parseFromString(data, 'text/html')
    const obj = {
        worldSpeed: Number(htmlDoc.getElementsByTagName("speed")[0].innerHTML),
        unitSpeed: Number(htmlDoc.getElementsByTagName("unit_speed")[0].innerHTML)
    }
    localStorage.setItem(key, JSON.stringify(obj))
    return obj
}

// Entry point — MUST stay the last statement in the file (see the note where the
// original mid-file call sat: earlier invocation lets later `var` initializers
// clobber the state main() just restored).
if(ssRightScreen) main()
