const Unifi = require('node-unifi');

require('dotenv').config();

const NULL_MAC = '00:00:00:00:00:00';
const NULL_ID = '000000000000000000000000';

const unifi = new Unifi.Controller({host: process.env.UI_HOST, port: process.env.UI_PORT, sslverify: false});

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    try {
        // LOGIN
        const loginData = await unifi.login(process.env.UI_USER, process.env.UI_PASS);
        console.log('login: ' + loginData);

        if (process.env.DEBUG === 'true') {
            // GET SITE SYSINFO
            const sysinfo = await unifi.getSiteSysinfo();
            console.log('getSiteSysinfo: ' + sysinfo.length);
            console.log(JSON.stringify(sysinfo, null, 2));
        }

        if (process.env.U_LTE_MAC === NULL_MAC) {
            console.log('\n')
            console.log("U-LTE MAC not set, listing devices and exiting");
            await sleep(100);

            let devBasic = await unifi.getAccessDevicesBasic();
            if (process.env.DEBUG === 'true') {
                console.log('getAccessDevicesBasic: ' + devBasic.length);
                console.log(JSON.stringify(devBasic, null, 2));
            }

            devBasic.find(dev => {
                console.log(dev.mac + ' ' + dev.model + ' ' + dev.name);
                if (dev.name.includes('LTE')) {
                    process.env.U_LTE_MAC = dev.mac;
                    console.log('U-LTE MAC set to ' + dev.mac);
                    console.log("=> You should set U_LTE_MAC in .env file and run again");
                }
            })

            await sleep(1000);
            if (process.env.U_LTE_MAC === NULL_MAC) {
                return;
            }
        }

        console.log('\n')
        console.log('U-LTE MAC: ' + process.env.U_LTE_MAC);
        console.log("Getting U-LTE device info...");
        let dev = await unifi.getAccessDevices(process.env.U_LTE_MAC);
        if (process.env.DEBUG === 'true') {
            console.log('getAccessDevices: ' + dev.length);
            console.log(JSON.stringify(dev, null, 2));
        }
        if (dev.length === 0) {
            console.warn("U-LTE not found?!")
            return;
        }
        let info = dev[0];
        let failoverActive = info.lte_failover;
        console.log(`LTE Failover active: ${failoverActive}`)

        console.log('\n')
        if (process.env.LIMIT_TRAFFIC_RULE_ID === NULL_ID) {
            console.warn('Limit traffic rule not set, exiting');
            return;
        }

        console.log("Finding limit traffic route...")
        let trafficRules = await unifi._request(`/v2/api/site/<SITE>/trafficrules`, null, 'GET');
        if (process.env.DEBUG === 'true') {
            console.log('trafficRules: ' + trafficRules.length);
            console.log(JSON.stringify(trafficRules, null, 2));
        }

        let limitTrafficRule = trafficRules.find(rule => rule._id === process.env.LIMIT_TRAFFIC_RULE_ID);
        if (!limitTrafficRule) {
            console.warn('Limit traffic rule not found');
            return;
        }

        if (failoverActive && limitTrafficRule.enabled) {
            console.log("Limit rule already enabled, exiting")
            return;
        }
        if (!failoverActive && !limitTrafficRule.enabled) {
            console.log("Limit rule already disabled, exiting")
            return;
        }

        limitTrafficRule.enabled = failoverActive;

        console.log('\n')
        console.log(`Updating traffic rule to ${limitTrafficRule.enabled ? 'enabled' : 'disabled'}...`);
        try {
            await unifi._request(`/v2/api/site/<SITE>/trafficrules/${process.env.LIMIT_TRAFFIC_RULE_ID}`, limitTrafficRule, 'PUT')
        } catch (e) {
            console.log('Error updating traffic route: ' + e);
            console.log(e.response.data)
        }

        console.log("All done!")
        await sleep(100);

        // LOGOUT
        const logoutData = await unifi.logout();
        console.log('logout: ' + JSON.stringify(logoutData));
    } catch (error) {
        console.log('ERROR: ' + error);
    }
})();