import traci
import requests
import time

SUMO_CMD = ["sumo-gui", "-c", "traffic.sumocfg"] 


def get_state():
    lanes = traci.lane.getIDList()
    return [traci.lane.getLastStepVehicleNumber(l) for l in lanes[:4]]


def get_vehicle_positions():
    vehicles = traci.vehicle.getIDList()
    data = []

    for v in vehicles:
        x, y = traci.vehicle.getPosition(v)
        lane = traci.vehicle.getLaneID(v)

        data.append({
            "id": v,
            "x": x,
            "y": y,
            "lane": lane   # ✅ ADD THIS
        })

    return data

def get_signal_simple():
    tls_list = traci.trafficlight.getIDList()

    if len(tls_list) == 0:
        return "NONE"

    state = traci.trafficlight.getRedYellowGreenState(tls_list[0])

    # 👉 Simplify signal for UI
    if "G" in state[:2]:
        return "NS_GREEN"
    elif "G" in state[2:]:
        return "EW_GREEN"
    else:
        return "RED"


def set_signal(action):
    tls_list = traci.trafficlight.getIDList()

    if len(tls_list) == 0:
        return

    tls = tls_list[0]

    if action == 0:
        traci.trafficlight.setPhase(tls, 0)
    else:
        traci.trafficlight.setPhase(tls, 2)


def compute_reward(state):
    return -sum(state)


def run():
    traci.start(SUMO_CMD)

    print("Traffic Lights:", traci.trafficlight.getIDList())

    step = 0

    while traci.simulation.getMinExpectedNumber() > 0:
        traci.simulationStep()

        state = get_state()

        action = 0 if sum(state[:2]) > sum(state[2:]) else 1
        set_signal(action)

        reward = compute_reward(state)

        print(f"Step {step} | State {state} | Action {action} | Reward {reward}")

        try:
            requests.post(
                "http://localhost:5000/api/traffic/live",
                json={
                    "vehicles": get_vehicle_positions(),
                    "signal": get_signal_simple(),
                    "reward": reward
                },
                timeout=1
            )
        except:
            print("Node server not reachable")

        time.sleep(0.1)  # ✅ smooth UI updates
        step += 1

    traci.close()


if __name__ == "__main__":
    run()