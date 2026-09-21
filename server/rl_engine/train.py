import gymnasium as gym
from gymnasium import spaces
import numpy as np
import random
from stable_baselines3 import DQN, PPO





class TrafficEnv(gym.Env):
    """
    Custom Environment that follows gymnasium interface.
    This environment simulates a 4-way intersection.
    """
    def __init__(self):
        super(TrafficEnv, self).__init__()
        # Actions: 0 = Keep current light, 1 = Switch light
        self.action_space = spaces.Discrete(2)
        
        # State: [NS_queue, EW_queue, current_light, time_in_phase]
        # Normalized between 0 and 1
        self.observation_space = spaces.Box(low=0, high=1, shape=(4,), dtype=np.float32)
        
        self.max_queue = 20
        self.reset()

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.ns_queue = 0
        self.ew_queue = 0
        self.light = 0 # 0: NS, 1: EW
        self.time_in_phase = 0
        
        return self._get_obs(), {}

    def _get_obs(self):
        return np.array([
            self.ns_queue / self.max_queue,
            self.ew_queue / self.max_queue,
            float(self.light),
            min(self.time_in_phase / 10.0, 1.0)
        ], dtype=np.float32)

    def step(self, action):
        self.time_in_phase += 1
        
        # Apply Action
        switched = False
        if action == 1:
            self.light = 1 - self.light
            self.time_in_phase = 0
            switched = True
            
        # Simulate Traffic Flow
        # Arrival
        if random.random() < 0.4: self.ns_queue = min(self.ns_queue + 1, self.max_queue)
        if random.random() < 0.4: self.ew_queue = min(self.ew_queue + 1, self.max_queue)
        
        # Departure
        cleared = 0
        if self.light == 0 and self.ns_queue > 0:
            self.ns_queue -= 1
            cleared = 1
        elif self.light == 1 and self.ew_queue > 0:
            self.ew_queue -= 1
            cleared = 1
            
        # Reward Function
        # Penalize long queues
        reward = -(self.ns_queue + self.ew_queue)
        # Bonus for clearing traffic
        reward += cleared * 5.0
        # Penalty for switching to avoid flickering
        if switched:
            reward -= 2.0
            
        terminated = False
        truncated = False # We handle episode length in training loop or via wrapper
        
        return self._get_obs(), reward, terminated, truncated, {"cleared": cleared}

def train_model(algo="DQN", total_timesteps=10000):
    env = TrafficEnv()
    
    if algo == "DQN":
        model = DQN("MlpPolicy", env, verbose=1, learning_rate=1e-3, exploration_fraction=0.1)
    else:
        model = PPO("MlpPolicy", env, verbose=1)
        
    print(f"Starting training with {algo}...")
    model.learn(total_timesteps=total_timesteps)
    
    model_path = f"traffic_{algo.lower()}_model"
    model.save(model_path)
    print(f"Model saved to {model_path}")
    return model_path

if __name__ == "__main__":
    train_model(algo="DQN", total_timesteps=20000)
