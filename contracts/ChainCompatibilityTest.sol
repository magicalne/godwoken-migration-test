// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

contract ChainCompatibilityTest {
    bool private _bool;
    uint private _uint; 
    int private  _int;
    address private _address;
    bytes32 private _bytes32;
    string private _string;
    
    uint[3] public _array = [1, 2, 3];
    mapping(uint => bool) public _mapping;
    
    constructor() public {
    }

    function mutate() public {
        _bool = true;
        _uint = 1;
        _int = -1;
        _address = msg.sender;
        _bytes32 = "0x1234";
        _string = "Hello";
        _mapping[1] = true;
    }
    
    // Getter functions
    function getBool() public view returns (bool) {
        return _bool;
    }
    
    function getUint() public view returns (uint) {
        return _uint; 
    }
    
    function getInt() public view returns (int) {
        return _int;
    }
    
    function getAddress() public view returns (address) {
        return _address; 
    }
    
    function getBytes32() public view returns (bytes32) {
        return _bytes32;
    }
    
    function getString() public view returns (string memory) {
        return _string;
    }
    
    function getArray(uint i) public view returns (uint) {
        return _array[i];
    }
    
    function getMapping(uint k) public view returns (bool) {
        return _mapping[k];
    }
    
    // Setter functions
    function setBool(bool _b) public {
        _bool = _b;
    }
    
    function setUint(uint _u) public {
        _uint = _u;
    }  
    
    function setInt(int _i) public {
        _int = _i;
    } 
    
    function setAddress(address _a) public {
        _address = _a;
    }  
    
    function setBytes32(bytes32 _b32) public {
        _bytes32 = _b32; 
    } 
    
    function setString(string memory _s) public {
        _string = _s;
    }  
    
    function setArray(uint i, uint _a) public {
        _array[i] = _a;
    }
    
    function setMapping(uint k, bool _m) public {
        _mapping[k] = _m;  
    } 
    
    
    function validate() public view returns (bool) {
        bool boolValid = _bool == true;
        bool uintValid = _uint == 1;
        bool intValid = _int == -1;
        bool addressValid = _address == msg.sender;
        bool bytes32Valid = _bytes32 == "0x1234"; 
        bool stringValid = keccak256(abi.encodePacked(_string)) == 
                            keccak256(abi.encodePacked("Hello"));
                            
        bool arrayValid = _array[0] == 1 && _array[1] == 2 && _array[2] == 3; 
        bool mappingValid = _mapping[1] == true;
                              
        return boolValid && uintValid && intValid && addressValid && 
            bytes32Valid && stringValid && arrayValid && mappingValid;
    } 
}
