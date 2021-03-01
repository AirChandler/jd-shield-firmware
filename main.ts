/*
Every frame is 4 bytes

No-op:
byte 0 - 0

Write pin:
byte 0 - 1
byte 1 - pin number (PA03 - 3, PB03 - 19, etc)
byte 2 - 0 or 1

Read pin - sends the same command back:
byte 0 - 2
byte 1 - pin#
byte 2 - Response - 0 or 1
byte 3 - 0 - no pull, 1 - pull up, 2 pull down

Read buttons -
byte 0 - 3
byte 1 - response

Analog read pin - response is little endian 2 byte value in range 0-1024
byte 0 - 4
byte 1 - pin#
byte 2 - Response
byte 3 - Response
*/

let n = 0

//% shim=pxt::getPin
declare function internalGetPin(id: number): PwmPin;

forever(() => {
    control.dmesg("fr:" + n++)
    pins.B3.digitalWrite(true)
    pause(1000)
    pins.B3.digitalWrite(false)
    pause(1000)
})

const spi = pins.createSlaveSPI(pins.A7, pins.A6, pins.A5, pins.A4)

const sendQ: Buffer[] = []
const buttons: DigitalInOutPin[] = [
    pins.A0, // menu
    pins.B7, // A
    pins.B6, // B
    pins.B1, // left
    pins.A15, // right
    pins.A8, // up
    pins.A10, // down
]

function handleCmd(b: Buffer) {
    control.dmesg("cmd:" + b[0])
    switch (b[0]) {
        case 1:
            internalGetPin(b[1]).digitalWrite(b[2] != 0)
            break
        case 2: {
            const p = internalGetPin(b[1])
            p.setPull(b[3] == 0 ? PinPullMode.PullNone :
                b[3] == 1 ? PinPullMode.PullUp : PinPullMode.PullDown)
            b[2] = p.digitalRead() ? 1 : 0
            sendQ.push(b)
            break
        }
        case 3:
            b[1] = 0
            for (let i = 0; i < buttons.length; ++i) {
                let v = false
                if (i == 0) {
                    buttons[i].setPull(PinPullMode.PullDown)
                    v = buttons[i].digitalRead()
                } else {
                    buttons[i].setPull(PinPullMode.PullUp)
                    v = !buttons[i].digitalRead()
                }
                if (v)
                    b[1] |= (1 << i)
            }
            sendQ.push(b)
            break
        case 4: {
            const p = internalGetPin(b[1])
            b.setNumber(NumberFormat.UInt16LE, 2, p.analogRead())
            sendQ.push(b)
            break
        }

    }
}

control.runInParallel(function () {
    while (true) {
        let sendB = sendQ.shift()
        if (!sendB) sendB = control.createBuffer(4)
        let recvB = control.createBuffer(4)
        spi.transfer(sendB, recvB)
        handleCmd(recvB)
    }
})
